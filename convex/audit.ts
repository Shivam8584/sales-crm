import { v } from "convex/values";
import {
  paginationOptsValidator,
  type FunctionReturnType,
} from "convex/server";
import { api } from "./_generated/api";
import { action } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  DAY_MS,
  DELETED_KEEP_DAYS,
  EDITS_KEEP_DAYS,
  decodeCursor,
  encodeCursor,
  keyed,
  mergePage,
  scan,
} from "../lib/domain/audit";
import { personName } from "../lib/domain/labels";
import { recordPath } from "../lib/routes";
import type { CsvCell } from "../lib/csv";
import { REF, primaryType, type RecordType } from "./activity";
import { restoreDeal } from "./deals";
import { fail, notFound } from "./lib/errors";
import {
  internalMutation,
  managerMutation,
  managerQuery,
} from "./lib/functions";
import { assertCan } from "./lib/permissions";
import { memberIndex, memberRef, type MemberRef } from "./lib/records";
import { literals } from "./lib/validators";
import { restoreTask } from "./tasks";

const RECORDS = ["accounts", "people", "leads", "deals", "tasks"] as const;
const DELETABLE = ["accounts", "people", "deals", "tasks"] as const;

const MAX_PAGE = 100;
const MAX_SCAN = 1000;
const MAX_EXPORT_ROWS = 20_000;
const SWEEP_BATCH = 500;

type Hit =
  | { at: number; ct: number; from: "timeline"; doc: Doc<"timeline"> }
  | { at: number; ct: number; from: "event"; doc: Doc<"auditEvents"> };

type Row = {
  _id: string;
  at: number;
  actor: MemberRef | null;
  recordType: RecordType | "tasks" | null;
  record: { name: string; href: string | null; archived: boolean } | null;
  changes: NonNullable<Doc<"auditEvents">["changes"]>;
};

const filters = {
  recordType: v.optional(literals(RECORDS)),
  actorId: v.optional(v.id("members")),
  from: v.optional(v.number()),
  to: v.optional(v.number()),
};

/**
 * Field-level changes across the CRM, newest first. Most come from the
 * timeline; task edits and deal stage moves are kept in `auditEvents`.
 * Pages are keyed by time (not Convex cursors) because two sources feed them.
 */
export const list = managerQuery({
  args: { ...filters, paginationOpts: paginationOptsValidator },
  handler: async (
    ctx,
    {
      paginationOpts,
      recordType,
      actorId,
      from = 0,
      to = Number.MAX_SAFE_INTEGER,
    },
  ) => {
    const limit = Math.min(Math.max(paginationOpts.numItems, 1), MAX_PAGE);
    const before = decodeCursor(paginationOpts.cursor);
    const upper = before ? Math.min(to, before.at + 1) : to;
    const options = { before, limit, maxScan: MAX_SCAN };

    const timeline =
      recordType === "tasks"
        ? null
        : scan(
            keyed(
              ctx.db
                .query("timeline")
                .withIndex("by_kind", (q) =>
                  q
                    .eq("kind", "change")
                    .gte("occurredAt", from)
                    .lt("occurredAt", upper),
                )
                .order("desc"),
              (doc) => ({
                at: doc.occurredAt,
                ct: doc._creationTime,
                from: "timeline" as const,
                doc,
              }),
            ),
            ({ doc }) =>
              (!actorId || doc.actorId === actorId) &&
              (!recordType || primaryType(doc) === recordType),
            options,
          );
    const events =
      recordType && recordType !== "deals" && recordType !== "tasks"
        ? null
        : scan(
            keyed(
              ctx.db
                .query("auditEvents")
                .withIndex("by_action_at", (q) =>
                  q.eq("action", "update").gte("at", from).lt("at", upper),
                )
                .order("desc"),
              (doc) => ({
                at: doc.at,
                ct: doc._creationTime,
                from: "event" as const,
                doc,
              }),
            ),
            ({ doc }) =>
              (!actorId || doc.actorId === actorId) &&
              (!recordType || doc.recordType === recordType),
            options,
          );
    const merged = mergePage<Hit>(
      (await Promise.all([timeline, events])).flatMap((source) =>
        source ? [source] : [],
      ),
      limit,
    );

    const entries = merged.rows.flatMap((row) =>
      row.from === "timeline" ? [row.doc] : [],
    );
    const ids = <T extends string>(
      pick: (entry: Doc<"timeline">) => T | undefined,
    ) => [...new Set(entries.flatMap((entry) => pick(entry) ?? []))];
    const dealIds = [
      ...ids((entry) => entry.dealId),
      ...merged.rows.flatMap((row) => {
        const id =
          row.from === "event" && row.doc.recordType === "deals"
            ? ctx.db.normalizeId("deals", row.doc.recordId)
            : null;
        return id ? [id] : [];
      }),
    ];
    const [members, accounts, people, leads, deals] = await Promise.all([
      memberIndex(ctx),
      Promise.all(
        ids((entry) =>
          primaryType(entry) === "accounts" ? entry.accountId : undefined,
        ).map((id) => ctx.db.get(id)),
      ),
      Promise.all(ids((entry) => entry.personId).map((id) => ctx.db.get(id))),
      Promise.all(ids((entry) => entry.leadId).map((id) => ctx.db.get(id))),
      Promise.all([...new Set(dealIds)].map((id) => ctx.db.get(id))),
    ]);
    const byId = new Map<
      string,
      Doc<"accounts"> | Doc<"people"> | Doc<"leads"> | Doc<"deals">
    >(
      [...accounts, ...people, ...leads, ...deals].flatMap((doc) =>
        doc ? [[doc._id, doc]] : [],
      ),
    );
    const erased = (id: Id<"people"> | Id<"leads"> | undefined) => {
      const doc = id ? byId.get(id) : undefined;
      return (
        doc !== undefined && "erasedAt" in doc && doc.erasedAt !== undefined
      );
    };
    const nameOf = (
      type: RecordType,
      doc: NonNullable<ReturnType<typeof byId.get>>,
    ) =>
      type === "deals"
        ? (doc as Doc<"deals">).title
        : type === "people"
          ? personName(doc as Doc<"people">)
          : (doc as Doc<"accounts"> | Doc<"leads">).name;

    const page = merged.rows.flatMap((row): Row[] => {
      if (row.from === "event") {
        const { doc } = row;
        const live = doc.recordType === "deals" && byId.has(doc.recordId);
        return [
          {
            _id: doc._id as string,
            at: doc.at,
            actor: memberRef(members, doc.actorId),
            recordType: doc.recordType,
            record: {
              name: doc.label,
              href: live ? recordPath("deals", doc.recordId) : null,
              archived: false,
            },
            changes: doc.changes ?? [],
          },
        ];
      }
      const { doc } = row;
      if (erased(doc.personId) || erased(doc.leadId)) return [];
      const type = primaryType(doc);
      const id = type ? doc[REF[type]] : undefined;
      const record = id ? byId.get(id) : undefined;
      return [
        {
          _id: doc._id as string,
          at: doc.occurredAt,
          actor: memberRef(members, doc.actorId),
          recordType: type,
          record:
            type && id && record
              ? {
                  name: nameOf(type, record) || "Unnamed",
                  href: recordPath(type, id),
                  archived:
                    "archivedAt" in record && record.archivedAt !== undefined,
                }
              : null,
          changes: doc.changes ?? [],
        },
      ];
    });
    return {
      page,
      isDone: merged.next === null,
      continueCursor: merged.next ? encodeCursor(merged.next) : "",
    };
  },
});

/**
 * Archived accounts and people, and deleted deals and tasks still inside the
 * restore window. Merged records and erased people are left out: they can't
 * come back.
 */
export const deleted = managerQuery({
  args: {
    recordType: literals(DELETABLE),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { recordType, paginationOpts }) => {
    if (recordType === "accounts" || recordType === "people") {
      const result =
        recordType === "accounts"
          ? await ctx.db
              .query("accounts")
              .withIndex("list_activity", (q) => q.gt("archivedAt", 0))
              .order("desc")
              .filter((q) => q.eq(q.field("mergedIntoId"), undefined))
              .paginate(paginationOpts)
          : await ctx.db
              .query("people")
              .withIndex("list_activity", (q) => q.gt("archivedAt", 0))
              .order("desc")
              .filter((q) =>
                q.and(
                  q.eq(q.field("mergedIntoId"), undefined),
                  q.eq(q.field("erasedAt"), undefined),
                ),
              )
              .paginate(paginationOpts);
      return {
        ...result,
        page: result.page.map((row) => ({
          id: row._id as string,
          label: "firstName" in row ? personName(row) || "Unnamed" : row.name,
          at: row.archivedAt ?? row._creationTime,
          by: null,
          until: null,
        })),
      };
    }
    const result = await ctx.db
      .query("auditEvents")
      .withIndex("by_action_at", (q) =>
        q
          .eq("action", "delete")
          .gte("at", Date.now() - DELETED_KEEP_DAYS * DAY_MS),
      )
      .order("desc")
      .filter((q) =>
        q.and(
          q.eq(q.field("recordType"), recordType),
          q.eq(q.field("restoredAt"), undefined),
        ),
      )
      .paginate(paginationOpts);
    const members = await memberIndex(ctx);
    return {
      ...result,
      page: result.page.map((row) => ({
        id: row._id as string,
        label: row.label,
        at: row.at,
        by: memberRef(members, row.actorId),
        until: row.at + DELETED_KEEP_DAYS * DAY_MS,
      })),
    };
  },
});

/** Re-creates a deleted deal or task from its saved copy. */
export const restore = managerMutation({
  args: { id: v.id("auditEvents") },
  handler: async (ctx, { id }) => {
    assertCan(ctx.viewer, "record.restore");
    const event = await ctx.db.get(id);
    if (!event || event.action !== "delete") notFound("Deleted record");
    if (event.restoredAt) fail("conflict", "That was already restored");
    if (!event.snapshot || event.at < Date.now() - DELETED_KEEP_DAYS * DAY_MS) {
      fail(
        "conflict",
        `Deleted records can only be restored for ${DELETED_KEEP_DAYS} days`,
      );
    }
    await ctx.db.patch(id, { restoredAt: Date.now(), snapshot: undefined });
    if (event.recordType === "tasks") {
      return {
        recordType: "tasks" as const,
        id: await restoreTask(ctx, event.snapshot),
      };
    }
    const previous = ctx.db.normalizeId("deals", event.recordId);
    if (!previous) notFound("Deal");
    const { deal, taskIds } = event.snapshot;
    return {
      recordType: "deals" as const,
      id: await restoreDeal(ctx, previous, deal, taskIds),
    };
  },
});

/** Everything the current filters match, one row per changed field. */
export const exportCsv = action({
  args: filters,
  handler: async (
    ctx,
    args,
  ): Promise<{ rows: CsvCell[][]; truncated: boolean }> => {
    await ctx.runQuery(api.exports.assertCanExport, {});
    const rows: CsvCell[][] = [
      ["When", "Who", "Record type", "Record", "Field", "Before", "After"],
    ];
    let cursor: string | null = null;
    for (;;) {
      const result: FunctionReturnType<typeof api.audit.list> =
        await ctx.runQuery(api.audit.list, {
          ...args,
          paginationOpts: { numItems: MAX_PAGE, cursor },
        });
      for (const entry of result.page) {
        for (const change of entry.changes) {
          rows.push([
            new Date(entry.at).toISOString(),
            entry.actor?.name ?? "System",
            entry.recordType ?? "",
            entry.record?.name ?? "",
            change.field,
            change.from ?? "",
            change.to ?? "",
          ]);
        }
      }
      if (result.isDone) return { rows, truncated: false };
      if (rows.length > MAX_EXPORT_ROWS) return { rows, truncated: true };
      cursor = result.continueCursor;
    }
  },
});

/** Drops deleted-record copies after the restore window and old edits after a year. */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = [
      ...(await ctx.db
        .query("auditEvents")
        .withIndex("by_action_at", (q) =>
          q.eq("action", "delete").lt("at", now - DELETED_KEEP_DAYS * DAY_MS),
        )
        .take(SWEEP_BATCH)),
      ...(await ctx.db
        .query("auditEvents")
        .withIndex("by_action_at", (q) =>
          q.eq("action", "update").lt("at", now - EDITS_KEEP_DAYS * DAY_MS),
        )
        .take(SWEEP_BATCH)),
    ];
    for (const row of expired) await ctx.db.delete(row._id);
  },
});
