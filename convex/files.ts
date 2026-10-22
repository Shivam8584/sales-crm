import { v } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_BYTES,
  cleanFileName,
} from "../lib/domain/files";
import { ROLE_RANK } from "../lib/domain/enums";
import { fail, notFound } from "./lib/errors";
import { internalMutation, memberMutation, memberQuery } from "./lib/functions";
import {
  MAX_ATTACHMENTS,
  attachmentsOf,
  type AttachmentTarget,
} from "./lib/attachments";
import { rateLimiter } from "./lib/rateLimiter";
import { memberIndex } from "./lib/records";
import { logSystem, type RecordRefs } from "./lib/timeline";

const vTarget = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ personId: v.id("people") }),
  v.object({ dealId: v.id("deals") }),
  v.object({ leadId: v.id("leads") }),
);

/** Timeline refs for the record, or why it can't take files. */
async function refsFor(
  ctx: MutationCtx,
  target: AttachmentTarget,
): Promise<RecordRefs | string> {
  if ("accountId" in target) {
    return (await ctx.db.get(target.accountId))
      ? { accountId: target.accountId }
      : "Account not found";
  }
  if ("personId" in target) {
    const person = await ctx.db.get(target.personId);
    if (!person) return "Person not found";
    if (person.erasedAt) return "This person's data was erased";
    return { personId: person._id, accountId: person.accountId };
  }
  if ("dealId" in target) {
    const deal = await ctx.db.get(target.dealId);
    return deal
      ? { dealId: deal._id, accountId: deal.accountId }
      : "Deal not found";
  }
  const lead = await ctx.db.get(target.leadId);
  if (!lead) return "Lead not found";
  if (lead.erasedAt) return "This lead's data was erased";
  return { leadId: lead._id };
}

export const generateUploadUrl = memberMutation({
  args: {},
  handler: async (ctx) => {
    const { ok, retryAfter } = await rateLimiter.limit(ctx, "fileUpload", {
      key: ctx.viewer._id,
    });
    if (!ok) {
      fail(
        "rate_limited",
        `You're uploading too fast. Try again in ${Math.ceil(retryAfter / 1000)} s.`,
      );
    }
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * A refused upload is answered, not thrown: an error would roll back the
 * deletion of the blob it leaves behind.
 */
export const attach = memberMutation({
  args: { target: vTarget, storageId: v.id("_storage"), name: v.string() },
  handler: async (ctx, { target, storageId, name }) => {
    const meta = await ctx.db.system.get(storageId);
    if (!meta) notFound("File");
    const taken = await ctx.db
      .query("attachments")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();
    if (taken) fail("conflict", "That file is already attached");
    const contentType = (meta.contentType ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const reject = async (message: string) => {
      await ctx.storage.delete(storageId);
      return { ok: false as const, message };
    };

    if (meta.size === 0) return await reject("That file is empty");
    if (meta.size > MAX_FILE_BYTES) {
      return await reject(
        `Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB`,
      );
    }
    if (!ALLOWED_FILE_TYPES.includes(contentType)) {
      return await reject("That file type isn't supported");
    }
    const refs = await refsFor(ctx, target);
    if (typeof refs === "string") return await reject(refs);
    const held = await attachmentsOf(ctx, target).take(MAX_ATTACHMENTS);
    if (held.length >= MAX_ATTACHMENTS) {
      return await reject(`A record can hold ${MAX_ATTACHMENTS} files`);
    }

    const clean = cleanFileName(name);
    const id = await ctx.db.insert("attachments", {
      ...target,
      storageId,
      name: clean,
      size: meta.size,
      contentType,
      uploadedById: ctx.viewer._id,
    });
    await logSystem(ctx, refs, `attached ${clean}`, undefined, ctx.viewer._id);
    return { ok: true as const, id };
  },
});

export const list = memberQuery({
  args: { target: vTarget },
  handler: async (ctx, { target }) => {
    const [rows, members] = await Promise.all([
      attachmentsOf(ctx, target).order("desc").take(MAX_ATTACHMENTS),
      memberIndex(ctx),
    ]);
    const manager = ROLE_RANK[ctx.viewer.role] >= ROLE_RANK.manager;
    return await Promise.all(
      rows.map(async (row) => ({
        _id: row._id,
        name: row.name,
        size: row.size,
        contentType: row.contentType,
        uploadedBy: members.get(row.uploadedById)?.name ?? null,
        uploadedAt: row._creationTime,
        url: await ctx.storage.getUrl(row.storageId),
        removable: manager || row.uploadedById === ctx.viewer._id,
      })),
    );
  },
});

export const remove = memberMutation({
  args: { id: v.id("attachments") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) notFound("File");
    const manager = ROLE_RANK[ctx.viewer.role] >= ROLE_RANK.manager;
    if (!manager && row.uploadedById !== ctx.viewer._id) {
      fail("forbidden", "Only the uploader or a manager can remove this file");
    }
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
    const refs = await refsFor(ctx, targetOf(row));
    if (typeof refs !== "string") {
      await logSystem(
        ctx,
        refs,
        `removed ${row.name}`,
        undefined,
        ctx.viewer._id,
      );
    }
  },
});

function targetOf(row: Doc<"attachments">): AttachmentTarget {
  if (row.accountId) return { accountId: row.accountId };
  if (row.personId) return { personId: row.personId };
  if (row.dealId) return { dealId: row.dealId };
  return { leadId: row.leadId! };
}

const ORPHAN_AFTER_MS = 24 * 60 * 60_000;

/** Deletes uploads that were never attached to a record (an upload URL used, then the form abandoned). */
export const sweepOrphans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - ORPHAN_AFTER_MS;
    const stale = await ctx.db.system
      .query("_storage")
      .order("asc")
      .filter((q) => q.lt(q.field("_creationTime"), cutoff))
      .take(200);
    for (const file of stale) {
      const attached = await ctx.db
        .query("attachments")
        .withIndex("by_storage", (q) => q.eq("storageId", file._id))
        .first();
      const logo = await ctx.db
        .query("accounts")
        .withIndex("by_logo_storage", (q) => q.eq("logoStorageId", file._id))
        .first();
      if (!attached && !logo) await ctx.storage.delete(file._id);
    }
  },
});
