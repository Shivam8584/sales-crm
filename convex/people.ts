import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  cleanTags,
  cleanText,
  normalizeEmail,
  normalizeLinkedin,
  normalizePhone,
} from "../lib/domain/normalize";
import { fail, invalid } from "./lib/errors";
import { memberMutation, memberQuery } from "./lib/functions";
import {
  memberIndex,
  memberRef,
  personSearchText,
  requireAccount,
  requireActiveMember,
  requirePerson,
} from "./lib/records";
import { diff, logChanges, logSystem } from "./lib/timeline";

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
      ? { _id: account._id, name: account.name, domain: account.domain ?? null }
      : null,
    owner: memberRef(members, person.ownerId),
    lastActivityAt: person.lastActivityAt ?? null,
    archivedAt: person.archivedAt ?? null,
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

export const get = memberQuery({
  args: { id: v.id("people") },
  handler: async (ctx, { id }) => {
    const person = await ctx.db.get(id);
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
    const now = Date.now();
    const draft = {
      firstName: fields.firstName!,
      lastName: fields.lastName ?? "",
      email: fields.email,
      phone: fields.phone,
      title: fields.title,
      accountId: fields.accountId,
      ownerId: fields.ownerId!,
      tags: [],
      updatedAt: now,
      lastActivityAt: now,
    };
    const account = draft.accountId ? await ctx.db.get(draft.accountId) : null;
    const id = await ctx.db.insert("people", {
      ...draft,
      searchText: personSearchText(draft, account?.name),
    });
    await logSystem(
      ctx,
      { personId: id, accountId: draft.accountId },
      `added ${[draft.firstName, draft.lastName].filter(Boolean).join(" ")}`,
      undefined,
      ctx.viewer._id,
    );
    return id;
  },
});

/** Returns the previous values so the client can offer undo. */
export const update = memberMutation({
  args: { id: v.id("people"), patch: v.object(editable) },
  handler: async (ctx, { id, patch }) => {
    const person = await requirePerson(ctx, id);
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
      await ctx.db.patch(id, {
        archivedAt: archived ? now : undefined,
        updatedAt: now,
      });
    }
  },
});
