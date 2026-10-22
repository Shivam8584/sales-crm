import { v } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { movedPhrase } from "../../lib/domain/dedupe";
import { STAGE_LABEL, personName } from "../../lib/domain/labels";
import { cleanTags } from "../../lib/domain/normalize";
import { subjectKey } from "../../lib/domain/automations";
import { recordKey } from "../../lib/domain/notifications";
import { notify } from "../notifications";
import { finish } from "./automations/engine";
import { leaveDeals } from "./deals";
import { fail, invalid } from "./errors";
import { diff, logChanges, logSystem } from "./timeline";
import { personSearchText, requireActiveMember } from "./records";

/** Rows moved per table in one step, which keeps a step well inside a transaction's limits. */
export const STEP = 200;

const vSide = v.union(v.literal("winner"), v.literal("loser"));

/** Which record's value each field keeps; absent means the winner's unless it is empty. */
export const vChoices = v.object({
  name: v.optional(vSide),
  domain: v.optional(vSide),
  gstin: v.optional(vSide),
  ownerId: v.optional(vSide),
  stage: v.optional(vSide),
  logo: v.optional(vSide),
  tags: v.optional(v.union(vSide, v.literal("union"))),
  custom: v.optional(v.record(v.string(), vSide)),
  email: v.optional(vSide),
  phone: v.optional(vSide),
  title: v.optional(vSide),
  linkedinUrl: v.optional(vSide),
  accountId: v.optional(vSide),
});
export type Choices = typeof vChoices.type;
type Side = typeof vSide.type;

export type Moved = Record<string, number>;

const isEmpty = (value: unknown) =>
  value === undefined || value === null || value === "";

function pick<T>(side: Side | undefined, winner: T, loser: T): T {
  if (side === "loser") return loser;
  if (side === "winner") return winner;
  return isEmpty(winner) ? loser : winner;
}

function mergeTags(choice: Choices["tags"], winner: string[], loser: string[]) {
  if (choice === "winner") return winner;
  if (choice === "loser") return loser;
  return cleanTags([...winner, ...loser]);
}

type Custom = Record<string, string | number | boolean>;

function mergeCustom(
  winner: Custom | undefined,
  loser: Custom | undefined,
  choices: Choices["custom"],
) {
  const out: Custom = {};
  const keys = new Set([
    ...Object.keys(winner ?? {}),
    ...Object.keys(loser ?? {}),
  ]);
  for (const key of keys) {
    const value = pick(choices?.[key], winner?.[key], loser?.[key]);
    if (!isEmpty(value)) out[key] = value!;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const later = (a: number | undefined, b: number | undefined) =>
  Math.max(a ?? 0, b ?? 0) || undefined;

type Lockable = {
  archivedAt?: number;
  erasedAt?: number;
  mergingInto?: string;
  mergingFrom?: string;
  mergedIntoId?: string;
};

/** The refusals shared by both record types. */
export function checkPair(winner: Lockable, loser: Lockable, noun: string) {
  if (loser.mergedIntoId) fail("conflict", `That ${noun} was already merged`);
  if (loser.mergingInto) {
    fail("conflict", `That ${noun} is already being merged into another`);
  }
  if (loser.mergingFrom) {
    fail("conflict", `Another ${noun} is being merged into that one`);
  }
  if (winner.mergingInto || winner.mergedIntoId) {
    fail("conflict", `The ${noun} you're keeping is being merged elsewhere`);
  }
  if (winner.mergingFrom) {
    fail("conflict", `Another ${noun} is already being merged into that one`);
  }
  if (loser.erasedAt || winner.erasedAt) {
    fail("forbidden", "Erased people can't be merged");
  }
  if (loser.archivedAt || winner.archivedAt) {
    fail("conflict", "Archived records can't be merged");
  }
}

const ACCOUNT_LABELS = {
  name: "Name",
  domain: "Website",
  stage: "Stage",
  tags: "Tags",
  gstin: "GSTIN",
} as const;

const PERSON_LABELS = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  title: "Title",
  linkedinUrl: "LinkedIn",
  tags: "Tags",
} as const;

async function ownerChange(
  ctx: MutationCtx,
  from: Id<"members">,
  to: Id<"members">,
) {
  const [a, b] = await Promise.all([ctx.db.get(from), ctx.db.get(to)]);
  return { field: "Owner", from: a?.name, to: b?.name };
}

/**
 * Applies the chosen field values to the winner and marks both records as
 * mid-merge. The loser lets go of its platform link at once so nothing else
 * can find it by that key.
 */
export async function lockAccounts(
  ctx: MutationCtx,
  actorId: Id<"members">,
  winner: Doc<"accounts">,
  loser: Doc<"accounts">,
  choices: Choices,
) {
  if (
    winner.platformOrgId &&
    loser.platformOrgId &&
    winner.platformOrgId !== loser.platformOrgId
  ) {
    fail(
      "conflict",
      `${winner.name} and ${loser.name} are linked to different Hypedrive organisations, so they can't be merged`,
    );
  }
  const now = Date.now();
  const ownerId = pick(choices.ownerId, winner.ownerId, loser.ownerId);
  if (ownerId !== winner.ownerId) {
    await requireActiveMember(ctx, ownerId, "ownerId");
  }
  const gstinOf =
    (choices.gstin ?? (winner.gstin ? "winner" : "loser")) === "winner"
      ? winner
      : loser;
  const logoOf =
    (choices.logo ??
      (winner.logoUrl || winner.logoStorageId ? "winner" : "loser")) ===
    "winner"
      ? winner
      : loser;
  const next = {
    name: pick(choices.name, winner.name, loser.name),
    domain: pick(choices.domain, winner.domain, loser.domain),
    gstin: gstinOf.gstin,
    panRoot: gstinOf.panRoot,
    ownerId,
    stage: pick(choices.stage, winner.stage, loser.stage),
    tags: mergeTags(choices.tags, winner.tags, loser.tags),
    custom: mergeCustom(winner.custom, loser.custom, choices.custom),
    logoUrl: logoOf.logoUrl,
    logoStorageId: logoOf.logoStorageId,
    platformOrgId: winner.platformOrgId ?? loser.platformOrgId,
  };
  const changes = diff(
    { ...winner, stage: STAGE_LABEL[winner.stage] },
    { ...next, stage: STAGE_LABEL[next.stage] },
    ACCOUNT_LABELS,
  );
  if (ownerId !== winner.ownerId) {
    changes.push(await ownerChange(ctx, winner.ownerId, ownerId));
  }
  const replaced = winner.logoStorageId;
  if (
    logoOf === loser &&
    replaced &&
    replaced !== loser.logoStorageId &&
    (await ctx.db.system.get(replaced))
  ) {
    await ctx.storage.delete(replaced);
  }
  await ctx.db.patch(winner._id, {
    ...next,
    mergingFrom: loser._id,
    lastActivityAt: later(winner.lastActivityAt, loser.lastActivityAt),
    updatedAt: now,
  });
  await ctx.db.patch(loser._id, {
    mergingInto: winner._id,
    platformOrgId: undefined,
    ...(logoOf === loser
      ? { logoUrl: undefined, logoStorageId: undefined }
      : {}),
    updatedAt: now,
  });
  await logChanges(ctx, { accountId: winner._id }, actorId, changes);
}

export async function lockPeople(
  ctx: MutationCtx,
  actorId: Id<"members">,
  winner: Doc<"people">,
  loser: Doc<"people">,
  choices: Choices,
) {
  if (
    winner.platformUserId &&
    loser.platformUserId &&
    winner.platformUserId !== loser.platformUserId
  ) {
    fail(
      "conflict",
      `${personName(winner)} and ${personName(loser)} are different Hypedrive users, so they can't be merged`,
    );
  }
  const now = Date.now();
  const ownerId = pick(choices.ownerId, winner.ownerId, loser.ownerId);
  if (ownerId !== winner.ownerId) {
    await requireActiveMember(ctx, ownerId, "ownerId");
  }
  const named = pick(choices.name, winner, loser);
  const accountId = pick(choices.accountId, winner.accountId, loser.accountId);
  const account = accountId ? await ctx.db.get(accountId) : null;
  if (accountId && !account) invalid("accountId", "That account is gone");
  const next = {
    firstName: named.firstName,
    lastName: named.lastName,
    email: pick(choices.email, winner.email, loser.email),
    phone: pick(choices.phone, winner.phone, loser.phone),
    title: pick(choices.title, winner.title, loser.title),
    linkedinUrl: pick(
      choices.linkedinUrl,
      winner.linkedinUrl,
      loser.linkedinUrl,
    ),
    accountId,
    ownerId,
    tags: mergeTags(choices.tags, winner.tags, loser.tags),
    custom: mergeCustom(winner.custom, loser.custom, choices.custom),
    platformUserId: winner.platformUserId ?? loser.platformUserId,
  };
  const changes = diff(winner, next, PERSON_LABELS);
  if (accountId !== winner.accountId) {
    const previous = winner.accountId
      ? await ctx.db.get(winner.accountId)
      : null;
    changes.push({ field: "Account", from: previous?.name, to: account?.name });
  }
  if (ownerId !== winner.ownerId) {
    changes.push(await ownerChange(ctx, winner.ownerId, ownerId));
  }
  await ctx.db.patch(winner._id, {
    ...next,
    searchText: personSearchText(next, account?.name),
    mergingFrom: loser._id,
    lastActivityAt: later(winner.lastActivityAt, loser.lastActivityAt),
    updatedAt: now,
  });
  await ctx.db.patch(loser._id, {
    mergingInto: winner._id,
    platformUserId: undefined,
    updatedAt: now,
  });
  if (winner.accountId && accountId !== winner.accountId) {
    await leaveDeals(ctx, winner, winner.accountId, actorId);
  }
  await logChanges(
    ctx,
    { personId: winner._id, accountId: accountId ?? undefined },
    actorId,
    changes,
  );
}

async function each<T>(rows: T[], apply: (row: T) => Promise<unknown>) {
  for (const row of rows) await apply(row);
  return rows.length;
}

/**
 * Follows, pins and notifications name a record by `<table>:<id>`. They move to
 * the winner, or go when the member already has one for it.
 */
async function moveKeys(
  ctx: MutationCtx,
  table: "accounts" | "people",
  loserId: string,
  winnerId: string,
): Promise<Moved> {
  const from = recordKey(table, loserId);
  const to = recordKey(table, winnerId);
  const moved: Moved = {};

  const follows = await ctx.db
    .query("follows")
    .withIndex("by_record", (q) => q.eq("record", from))
    .take(STEP);
  moved.follows = await each(follows, async (follow) => {
    const kept = await ctx.db
      .query("follows")
      .withIndex("by_member_record", (q) =>
        q.eq("memberId", follow.memberId).eq("record", to),
      )
      .first();
    if (kept) await ctx.db.delete(follow._id);
    else await ctx.db.patch(follow._id, { record: to });
  });

  const members = await ctx.db.query("members").collect();
  let pins = 0;
  for (const member of members) {
    const pin = await ctx.db
      .query("pins")
      .withIndex("by_member_record", (q) =>
        q.eq("memberId", member._id).eq("record", from),
      )
      .first();
    if (!pin) continue;
    const kept = await ctx.db
      .query("pins")
      .withIndex("by_member_record", (q) =>
        q.eq("memberId", member._id).eq("record", to),
      )
      .first();
    if (kept) await ctx.db.delete(pin._id);
    else await ctx.db.patch(pin._id, { record: to });
    pins++;
  }
  moved.pins = pins;

  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_record_kind", (q) => q.eq("record", from))
    .take(STEP);
  moved.notifications = await each(notifications, (item) =>
    ctx.db.patch(item._id, {
      record: to,
      href: item.href?.replace(loserId, winnerId),
    }),
  );
  return moved;
}

/** Live sequence runs end rather than carry over to a record they weren't built for. */
async function exitRuns(
  ctx: MutationCtx,
  kind: "account" | "person",
  loserId: string,
) {
  let exited = 0;
  for (const status of ["running", "waiting"] as const) {
    const runs = await ctx.db
      .query("automationEnrollments")
      .withIndex("by_subject", (q) =>
        q.eq("subjectKey", subjectKey(kind, loserId)).eq("status", status),
      )
      .take(STEP);
    exited += await each(runs, (run) =>
      finish(
        ctx,
        run,
        "exited",
        "Merged into another record",
        undefined,
        "record_gone",
      ),
    );
  }
  return exited;
}

/** One step of an account merge: moves up to `STEP` rows per table and reports what moved. */
export async function stepAccounts(
  ctx: MutationCtx,
  winner: Doc<"accounts">,
  loser: Doc<"accounts">,
): Promise<Moved> {
  const from = loser._id;
  const to = winner._id;
  const moved: Moved = {};

  moved.people = await each(
    await ctx.db
      .query("people")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (person) =>
      ctx.db.patch(person._id, {
        accountId: to,
        searchText: personSearchText(person, winner.name),
      }),
  );
  moved.deals = await each(
    await ctx.db
      .query("deals")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  moved.tasks = await each(
    await ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  moved.leads = await each(
    await ctx.db
      .query("leads")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  moved.timeline = await each(
    await ctx.db
      .query("timeline")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  moved.files = await each(
    await ctx.db
      .query("attachments")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  moved.facts = await each(
    await ctx.db
      .query("facts")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  moved.enrichmentRuns = await each(
    await ctx.db
      .query("enrichmentRuns")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  moved.prospectBrands = await each(
    await ctx.db
      .query("prospectBrands")
      .withIndex("by_account", (q) => q.eq("accountId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { accountId: to }),
  );
  const snapshots = await ctx.db
    .query("platformSnapshots")
    .withIndex("by_account", (q) => q.eq("accountId", from))
    .take(STEP);
  const hasSnapshot = Boolean(
    await ctx.db
      .query("platformSnapshots")
      .withIndex("by_account", (q) => q.eq("accountId", to))
      .first(),
  );
  moved.snapshots = await each(snapshots, (row) =>
    hasSnapshot
      ? ctx.db.delete(row._id)
      : ctx.db.patch(row._id, { accountId: to }),
  );
  moved.sequences = await exitRuns(ctx, "account", from);
  Object.assign(moved, await moveKeys(ctx, "accounts", from, to));
  return moved;
}

/** One step of a person merge. */
export async function stepPeople(
  ctx: MutationCtx,
  winner: Doc<"people">,
  loser: Doc<"people">,
): Promise<Moved> {
  const from = loser._id;
  const to = winner._id;
  const moved: Moved = {};

  moved.leads = await each(
    await ctx.db
      .query("leads")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.consents = await each(
    await ctx.db
      .query("consents")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.tasks = await each(
    await ctx.db
      .query("tasks")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.timeline = await each(
    await ctx.db
      .query("timeline")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.files = await each(
    await ctx.db
      .query("attachments")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.facts = await each(
    await ctx.db
      .query("facts")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.enrichmentRuns = await each(
    await ctx.db
      .query("enrichmentRuns")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.retentionReviews = await each(
    await ctx.db
      .query("retentionReviews")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.messages = await each(
    await ctx.db
      .query("automationMessages")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );
  moved.calls = await each(
    await ctx.db
      .query("phoneCalls")
      .withIndex("by_person", (q) => q.eq("personId", from))
      .take(STEP),
    (row) => ctx.db.patch(row._id, { personId: to }),
  );

  const deals = loser.accountId
    ? (
        await ctx.db
          .query("deals")
          .withIndex("by_account", (q) => q.eq("accountId", loser.accountId!))
          .collect()
      ).filter((deal) => deal.personIds.includes(from))
    : [];
  moved.deals = await each(deals.slice(0, STEP), (deal) => {
    const rest = deal.personIds.filter((id) => id !== from);
    const personIds =
      deal.accountId === winner.accountId && !rest.includes(to)
        ? [...rest, to]
        : rest;
    return ctx.db.patch(deal._id, { personIds });
  });

  moved.sequences = await exitRuns(ctx, "person", from);
  Object.assign(moved, await moveKeys(ctx, "people", from, to));
  return moved;
}

export const total = (moved: Moved) =>
  Object.values(moved).reduce((sum, count) => sum + count, 0);

export function addMoved(into: Moved, step: Moved) {
  for (const [key, count] of Object.entries(step)) {
    into[key] = (into[key] ?? 0) + count;
  }
  return into;
}

export async function finishAccounts(
  ctx: MutationCtx,
  actorId: Id<"members">,
  winner: Doc<"accounts">,
  loser: Doc<"accounts">,
  moved: Moved,
) {
  const now = Date.now();
  await ctx.db.patch(loser._id, {
    archivedAt: now,
    mergedIntoId: winner._id,
    mergingInto: undefined,
    updatedAt: now,
  });
  await ctx.db.patch(winner._id, { mergingFrom: undefined, updatedAt: now });
  const embeddings = await ctx.db
    .query("accountEmbeddings")
    .withIndex("by_account", (q) => q.eq("accountId", loser._id))
    .collect();
  await each(embeddings, (row) => ctx.db.delete(row._id));
  await logSystem(
    ctx,
    { accountId: winner._id },
    `merged ${loser.name} into this record`,
    `Moved ${movedPhrase(moved)}.`,
    actorId,
  );
  await notify(ctx, actorId, {
    kind: "merge",
    title: `Merged ${loser.name} into ${winner.name}`,
    body: `Moved ${movedPhrase(moved)}.`,
    href: `/accounts/${winner._id}`,
  });
}

export async function finishPeople(
  ctx: MutationCtx,
  actorId: Id<"members">,
  winner: Doc<"people">,
  loser: Doc<"people">,
  moved: Moved,
) {
  const now = Date.now();
  await ctx.db.patch(loser._id, {
    archivedAt: now,
    mergedIntoId: winner._id,
    mergingInto: undefined,
    updatedAt: now,
  });
  await ctx.db.patch(winner._id, { mergingFrom: undefined, updatedAt: now });
  await logSystem(
    ctx,
    { personId: winner._id, accountId: winner.accountId },
    `merged ${personName(loser)} into this record`,
    `Moved ${movedPhrase(moved)}.`,
    actorId,
  );
  await notify(ctx, actorId, {
    kind: "merge",
    title: `Merged ${personName(loser)} into ${personName(winner)}`,
    body: `Moved ${movedPhrase(moved)}.`,
    href: `/people/${winner._id}`,
  });
}
