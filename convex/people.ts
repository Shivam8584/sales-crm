import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  cleanTags,
  cleanText,
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
} from "../lib/domain/normalize";
import { personName } from "../lib/domain/labels";
import { fail, invalid } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import {
  checkImportSize,
  findMember,
  importFailure,
  memberIndex,
  memberRef,
  personSearchText,
  requireAccount,
  requireActiveMember,
  requirePerson,
  type ImportResult,
} from "./lib/records";
import { dealsWithPerson, leaveDeals } from "./lib/deals";
import { diff, logChanges, logSystem } from "./lib/timeline";
import { bucketCounts, latestInteraction, windowStart } from "./timeline";

const MAX_TEXT = 120;

const editable = {
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  email: v.optional(v.union(v.string(), v.null())),
  phone: v.optional(v.union(v.string(), v.null())),
  title: v.optional(v.union(v.string(), v.null())),
  linkedinUrl: v.optional(v.union(v.string(), v.null())),
  accountId: v.optional(v.union(v.id("accounts"), v.null())),
  ownerId: v.optional(v.id("members")),
  tags: v.optional(v.array(v.string())),
};

type Patch = {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  linkedinUrl?: string | null;
  accountId?: Id<"accounts"> | null;
  ownerId?: Id<"members">;
  tags?: string[];
};

const LABELS = {
  firstName: "First name",
  lastName: "Last name",
  email: "Email",
  phone: "Phone",
  title: "Title",
  linkedinUrl: "LinkedIn",
  tags: "Tags",
} as const;

function optionalText(value: string | null, field: string) {
  const text = value === null ? undefined : cleanText(value);
  if (text && text.length > MAX_TEXT) invalid(field, "That is too long");
  return text;
}

async function clean(ctx: MutationCtx, patch: Patch, selfId?: Id<"people">) {
  const out: Partial<Doc<"people">> = {};
  if (patch.firstName !== undefined) {
    const firstName = cleanText(patch.firstName);
    if (!firstName) invalid("firstName", "Enter a first name");
    out.firstName = optionalText(firstName, "firstName");
  }
  if (patch.lastName !== undefined) {
    out.lastName = optionalText(patch.lastName, "lastName") ?? "";
  }
  if (patch.email !== undefined) {
    if (patch.email === null || !patch.email.trim()) {
      out.email = undefined;
    } else {
      const email = normalizeEmail(patch.email);
      if (!email) invalid("email", "Enter a valid email address");
      const taken = await ctx.db
        .query("people")
        .withIndex("by_email", (q) => q.eq("email", email))
        .first();
      if (taken && taken._id !== selfId && !taken.archivedAt) {
        fail(
          "conflict",
          `${taken.firstName} ${taken.lastName} already uses this email`,
          "email",
        );
      }
      out.email = email;
    }
  }
  if (patch.phone !== undefined) {
    if (patch.phone === null || !patch.phone.trim()) {
      out.phone = undefined;
    } else {
      const phone = normalizePhone(patch.phone);
      if (!phone)
        invalid("phone", "Enter a mobile number, or include the country code");
      out.phone = phone;
    }
  }
  if (patch.title !== undefined) out.title = optionalText(patch.title, "title");
  if (patch.linkedinUrl !== undefined) {
    if (patch.linkedinUrl === null || !patch.linkedinUrl.trim()) {
      out.linkedinUrl = undefined;
    } else {
      const url = normalizeLinkedin(patch.linkedinUrl);
      if (!url) invalid("linkedinUrl", "Enter a LinkedIn profile URL");
      out.linkedinUrl = url;
    }
  }
  if (patch.accountId !== undefined) {
    if (patch.accountId === null) {
      out.accountId = undefined;
    } else {
      await requireAccount(ctx, patch.accountId);
      out.accountId = patch.accountId;
    }
  }
  if (patch.ownerId !== undefined) {
    await requireActiveMember(ctx, patch.ownerId, "ownerId");
    out.ownerId = patch.ownerId;
  }
  if (patch.tags !== undefined) out.tags = cleanTags(patch.tags);
  return out;
}

async function withSearchText(ctx: MutationCtx, person: Doc<"people">) {
  const account = person.accountId ? await ctx.db.get(person.accountId) : null;
  return personSearchText(person, account?.name);
}

function snapshot(person: Doc<"people">): Patch {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email ?? null,
    phone: person.phone ?? null,
    title: person.title ?? null,
    linkedinUrl: person.linkedinUrl ?? null,
    accountId: person.accountId ?? null,
    ownerId: person.ownerId,
    tags: person.tags,
  };
}

function toClient(
  person: Doc<"people">,
  members: Awaited<ReturnType<typeof memberIndex>>,
  accounts: Map<Id<"accounts">, Doc<"accounts">>,
) {
  const account = person.accountId ? accounts.get(person.accountId) : undefined;
  return {
    _id: person._id,
    _creationTime: person._creationTime,
    firstName: person.firstName,
    lastName: person.lastName,
    email: person.email ?? null,
    phone: person.phone ?? null,
    title: person.title ?? null,
    linkedinUrl: person.linkedinUrl ?? null,
    tags: person.tags,
    platformUserId: person.platformUserId ?? null,
    account: account
      ? {
          _id: account._id,
          name: account.name,
          domain: account.domain ?? null,
          logoUrl: account.logoUrl ?? null,
        }
      : null,
    owner: memberRef(members, person.ownerId),
    lastActivityAt: person.lastActivityAt ?? null,
    archivedAt: person.archivedAt ?? null,
    erasedAt: person.erasedAt ?? null,
  };
}

export const list = memberQuery({
  args: { accountId: v.optional(v.id("accounts")) },
  handler: async (ctx, { accountId }) => {
    const [people, accounts, members] = await Promise.all([
      accountId
        ? ctx.db
            .query("people")
            .withIndex("by_account", (q) => q.eq("accountId", accountId))
            .collect()
        : ctx.db
            .query("people")
            .withIndex("by_updated")
            .order("desc")
            .collect(),
      ctx.db.query("accounts").collect(),
      memberIndex(ctx),
    ]);
    const accountById = new Map(
      accounts.map((account) => [account._id, account]),
    );
    return people
      .filter((person) => !person.archivedAt)
      .map((person) => toClient(person, members, accountById));
  },
});

const TREND_DAYS = 14;

/**
 * Per-person rollups for the list: timeline entries per day for the last two
 * weeks and the latest logged interaction. Apart from `list` so timeline churn
 * doesn't re-run it.
 */
export const listStats = memberQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const since = windowStart(TREND_DAYS, now);
    const people = await ctx.db.query("people").collect();
    return await Promise.all(
      people
        .filter((person) => !person.archivedAt)
        .map(async (person) => {
          const recent = await ctx.db
            .query("timeline")
            .withIndex("by_person", (q) =>
              q.eq("personId", person._id).gte("occurredAt", since),
            )
            .collect();
          const lastInteraction = await latestInteraction(ctx, {
            personId: person._id,
          });
          return {
            personId: person._id,
            trend: bucketCounts(
              recent.map((entry) => entry.occurredAt),
              TREND_DAYS,
              now,
            ),
            lastInteraction,
          };
        }),
    );
  },
});

/** Takes a raw string because the id comes from the URL and may be stale or mistyped. */
export const get = memberQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("people", args.id);
    const person = id ? await ctx.db.get(id) : null;
    if (!person) return null;
    const account = person.accountId
      ? await ctx.db.get(person.accountId)
      : null;
    const members = await memberIndex(ctx);
    return toClient(
      person,
      members,
      new Map(account ? [[account._id, account]] : []),
    );
  },
});

async function insertPerson(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  fields: Partial<Doc<"people">>,
  account: Doc<"accounts"> | null,
  verb: string,
) {
  const now = Date.now();
  const draft = {
    firstName: fields.firstName!,
    lastName: fields.lastName ?? "",
    email: fields.email,
    phone: fields.phone,
    title: fields.title,
    linkedinUrl: fields.linkedinUrl,
    accountId: fields.accountId,
    ownerId: fields.ownerId!,
    tags: fields.tags ?? [],
    updatedAt: now,
    lastActivityAt: now,
  };
  const id = await ctx.db.insert("people", {
    ...draft,
    searchText: personSearchText(draft, account?.name),
  });
  await logSystem(
    ctx,
    { personId: id, accountId: draft.accountId },
    `${verb} ${[draft.firstName, draft.lastName].filter(Boolean).join(" ")}`,
    undefined,
    ctx.viewer._id,
  );
  return id;
}

export const create = memberMutation({
  args: {
    firstName: v.string(),
    lastName: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    accountId: v.optional(v.id("accounts")),
    ownerId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const fields = await clean(ctx, {
      ...args,
      lastName: args.lastName ?? "",
      ownerId: args.ownerId ?? ctx.viewer._id,
    });
    const account = fields.accountId
      ? await ctx.db.get(fields.accountId)
      : null;
    return await insertPerson(ctx, fields, account, "added");
  },
});

const vImportRow = v.object({
  firstName: v.string(),
  lastName: v.optional(v.string()),
  email: v.optional(v.string()),
  phone: v.optional(v.string()),
  title: v.optional(v.string()),
  linkedinUrl: v.optional(v.string()),
  account: v.optional(v.string()),
  owner: v.optional(v.string()),
  tags: v.optional(v.string()),
});

/**
 * Validates every row with the same rules as `create`; accounts are matched by
 * website or exact name. With `dryRun` nothing is written.
 */
export const importRows = memberMutation({
  args: { rows: v.array(vImportRow), dryRun: v.boolean() },
  handler: async (ctx, { rows, dryRun }) => {
    checkImportSize(rows.length);
    const [accounts, members] = await Promise.all([
      ctx.db.query("accounts").collect(),
      ctx.db.query("members").collect(),
    ]);
    const live = accounts.filter((account) => !account.archivedAt);
    const findAccount = (value: string) => {
      const text = value.trim().toLowerCase();
      const domain = normalizeDomain(text);
      const account =
        live.find((item) => domain && item.domain === domain) ??
        live.find((item) => item.name.toLowerCase() === text);
      if (!account) {
        invalid("account", `No account matches “${value.trim()}”`);
      }
      return account;
    };
    const emails = new Set<string>();
    const phones = new Set<string>();
    const results: ImportResult[] = [];
    for (const [row, input] of rows.entries()) {
      try {
        const account = input.account?.trim()
          ? findAccount(input.account)
          : null;
        const fields = await clean(ctx, {
          firstName: input.firstName,
          lastName: input.lastName ?? "",
          email: input.email,
          phone: input.phone,
          title: input.title,
          linkedinUrl: input.linkedinUrl,
          accountId: account?._id,
          ownerId: input.owner?.trim()
            ? findMember(members, input.owner)._id
            : ctx.viewer._id,
          tags: (input.tags ?? "").split(/[,;|]/),
        });
        const phone = fields.phone;
        const samePhone =
          phone &&
          (phones.has(phone) ||
            (
              await ctx.db
                .query("people")
                .withIndex("by_phone", (q) => q.eq("phone", phone))
                .collect()
            ).some((person) => !person.archivedAt));
        if (fields.email && emails.has(fields.email)) {
          results.push({
            row,
            status: "duplicate",
            message: `${fields.email} appears earlier in the file`,
          });
          continue;
        }
        if (samePhone) {
          results.push({
            row,
            status: "duplicate",
            message: `Someone already has ${phone}`,
          });
          continue;
        }
        if (fields.email) emails.add(fields.email);
        if (phone) phones.add(phone);
        if (dryRun) {
          results.push({ row, status: "ready" });
        } else {
          const id = await insertPerson(ctx, fields, account, "imported");
          results.push({ row, status: "created", id });
        }
      } catch (error) {
        results.push(importFailure(row, error));
      }
    }
    return results;
  },
});

/** Deals this person is on, open first. */
export const deals = memberQuery({
  args: { personId: v.id("people") },
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId);
    if (!person) return [];
    const [mine, members] = await Promise.all([
      dealsWithPerson(ctx, person),
      memberIndex(ctx),
    ]);
    const accounts = new Map<Id<"accounts">, Doc<"accounts">>();
    for (const deal of mine) {
      if (accounts.has(deal.accountId)) continue;
      const account = await ctx.db.get(deal.accountId);
      if (account) accounts.set(account._id, account);
    }
    const closed = (deal: Doc<"deals">) =>
      deal.stage === "won" || deal.stage === "lost";
    return mine
      .sort(
        (a, b) =>
          Number(closed(a)) - Number(closed(b)) ||
          (closed(a)
            ? (b.closedAt ?? 0) - (a.closedAt ?? 0)
            : a.position - b.position),
      )
      .map((deal) => {
        const account = accounts.get(deal.accountId);
        return {
          _id: deal._id,
          title: deal.title,
          stage: deal.stage,
          amount: deal.amount,
          closeDate: deal.closeDate ?? null,
          closedAt: deal.closedAt ?? null,
          owner: memberRef(members, deal.ownerId),
          account: account ? { _id: account._id, name: account.name } : null,
        };
      });
  },
});

/** Returns the previous values so the client can offer undo. */
export const update = memberMutation({
  args: { id: v.id("people"), patch: v.object(editable) },
  handler: async (ctx, { id, patch }) => {
    const person = await requirePerson(ctx, id);
    if (person.erasedAt) {
      fail("forbidden", "This person's data was erased and can't be edited");
    }
    const fields = await clean(ctx, patch, id);
    const before = snapshot(person);
    const changes = diff(person, fields, LABELS);
    if ("accountId" in fields && fields.accountId !== person.accountId) {
      const [from, to] = await Promise.all([
        person.accountId ? ctx.db.get(person.accountId) : null,
        fields.accountId ? ctx.db.get(fields.accountId) : null,
      ]);
      changes.push({ field: "Account", from: from?.name, to: to?.name });
    }
    if (fields.ownerId && fields.ownerId !== person.ownerId) {
      const [from, to] = await Promise.all([
        ctx.db.get(person.ownerId),
        ctx.db.get(fields.ownerId),
      ]);
      changes.push({ field: "Owner", from: from?.name, to: to?.name });
    }
    if (changes.length === 0) return before;
    const next = { ...person, ...fields };
    await ctx.db.patch(id, {
      ...fields,
      searchText: await withSearchText(ctx, next),
      updatedAt: Date.now(),
    });
    if (person.accountId && next.accountId !== person.accountId) {
      await leaveDeals(ctx, person, person.accountId, ctx.viewer._id);
    }
    await logChanges(
      ctx,
      { personId: id, accountId: next.accountId },
      ctx.viewer._id,
      changes,
    );
    return before;
  },
});

export const setArchived = memberMutation({
  args: { ids: v.array(v.id("people")), archived: v.boolean() },
  handler: async (ctx, { ids, archived }) => {
    const now = Date.now();
    for (const id of ids) {
      const person = await requirePerson(ctx, id);
      if (Boolean(person.archivedAt) === archived) continue;
      if (!archived && person.erasedAt) {
        fail("forbidden", "Erased people stay archived");
      }
      await ctx.db.patch(id, {
        archivedAt: archived ? now : undefined,
        updatedAt: now,
      });
      await logSystem(
        ctx,
        { personId: id, accountId: person.accountId },
        `${archived ? "archived" : "restored"} ${personName(person)}`,
        undefined,
        ctx.viewer._id,
      );
    }
  },
});
