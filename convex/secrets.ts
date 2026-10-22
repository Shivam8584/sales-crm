import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import {
  SECRET_GROUPS,
  checkSecretValue,
  hintFor,
  secretKey,
} from "../lib/domain/secrets";
import { encryptSecret, encryptionConfigured } from "./lib/crypto";
import { fail, invalid } from "./lib/errors";
import { adminMutation, adminQuery } from "./lib/functions";

const HISTORY = 20;

/** Ciphertext only; `lib/secrets.ts` decrypts it for the caller that needs it. */
export const rows = internalQuery({
  args: { name: v.optional(v.string()) },
  handler: async (ctx, { name }) => {
    const found = name
      ? await ctx.db
          .query("secrets")
          .withIndex("by_name", (q) => q.eq("name", name))
          .take(1)
      : await ctx.db.query("secrets").take(100);
    return found.map(({ name, value }) => ({ name, value }));
  },
});

/** Which keys are set and where, never their values. */
export const status = adminQuery({
  args: {},
  handler: async (ctx) => {
    const [stored, events] = await Promise.all([
      ctx.db.query("secrets").take(100),
      ctx.db.query("secretEvents").order("desc").take(HISTORY),
    ]);
    const byName = new Map(stored.map((row) => [row.name, row]));
    const names = new Map<string, string>();
    for (const id of new Set([
      ...stored.map((row) => row.updatedBy),
      ...events.map((event) => event.actorId),
    ])) {
      names.set(id, (await ctx.db.get(id))?.name ?? "Removed member");
    }
    return {
      encryption: encryptionConfigured(),
      groups: SECRET_GROUPS.map((group) => ({
        ...group,
        keys: group.keys.map((key) => {
          const row = byName.get(key.name);
          const env = process.env[key.name]?.trim();
          return {
            ...key,
            source: env ? ("env" as const) : row ? ("stored" as const) : null,
            hint: env ? hintFor(key, env) : (row?.hint ?? null),
            stored: Boolean(row),
            updatedAt: row?.updatedAt ?? null,
            updatedBy: row ? names.get(row.updatedBy) : null,
          };
        }),
      })),
      history: events.map((event) => ({
        _id: event._id,
        name: event.name,
        action: event.action,
        by: names.get(event.actorId) ?? "Removed member",
        at: event._creationTime,
      })),
    };
  },
});

export const set = adminMutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const key = secretKey(args.name);
    if (!key) invalid("name", "That key can't be managed here");
    if (!encryptionConfigured()) {
      fail(
        "unavailable",
        "Set KEYS_ENCRYPTION_KEY on the Convex deployment to store keys here",
      );
    }
    const checked = checkSecretValue(key, args.value);
    if (!checked.ok) invalid("value", checked.error);

    const existing = await ctx.db
      .query("secrets")
      .withIndex("by_name", (q) => q.eq("name", key.name))
      .unique();
    const fields = {
      value: await encryptSecret(checked.value, key.name),
      hint: hintFor(key, checked.value),
      updatedBy: ctx.viewer._id,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("secrets", { name: key.name, ...fields });
    await ctx.db.insert("secretEvents", {
      name: key.name,
      action: existing ? "rotate" : "set",
      actorId: ctx.viewer._id,
    });
  },
});

export const remove = adminMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const existing = await ctx.db
      .query("secrets")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (!existing) return;
    await ctx.db.delete(existing._id);
    await ctx.db.insert("secretEvents", {
      name,
      action: "remove",
      actorId: ctx.viewer._id,
    });
  },
});
