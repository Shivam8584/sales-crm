import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { PLAYBOOK_KINDS, PLAYBOOK_LIMITS } from "../lib/domain/playbook";
import { cleanText } from "../lib/domain/normalize";
import { invalid, notFound } from "./lib/errors";
import {
  internalMutation,
  managerMutation,
  memberQuery,
} from "./lib/functions";
import { searchText, vSearch } from "./lib/lists";
import { insertStarter } from "./lib/playbookStarter";
import { literals } from "./lib/validators";

const vKind = literals(PLAYBOOK_KINDS);
const LIMIT = 100;

function entry(row: Doc<"playbook">) {
  const { _id, _creationTime, kind, title, body, tags, updatedAt } = row;
  return { _id, _creationTime, kind, title, body, tags, updatedAt };
}

export const list = memberQuery({
  args: { kind: v.optional(vKind), search: vSearch },
  handler: async (ctx, { kind, search }) => {
    const text = searchText(search);
    const rows = text
      ? await ctx.db
          .query("playbook")
          .withSearchIndex("search_text", (q) =>
            kind
              ? q.search("searchText", text).eq("kind", kind)
              : q.search("searchText", text),
          )
          .take(LIMIT)
      : await ctx.db
          .query("playbook")
          .withIndex("by_kind_title", (q) => (kind ? q.eq("kind", kind) : q))
          .take(LIMIT);
    return rows.map(entry);
  },
});

export const get = memberQuery({
  args: { id: v.id("playbook") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    return row ? entry(row) : null;
  },
});

export const save = managerMutation({
  args: {
    id: v.optional(v.id("playbook")),
    kind: vKind,
    title: v.string(),
    body: v.string(),
    tags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const {
      titleMin,
      titleMax,
      bodyMax,
      tags: maxTags,
      tagMax,
    } = PLAYBOOK_LIMITS;
    const title = cleanText(args.title) ?? "";
    if (title.length < titleMin || title.length > titleMax) {
      invalid("title", `Title must be ${titleMin}–${titleMax} characters`);
    }
    const body = args.body.replace(/\r\n?/g, "\n").trim();
    if (!body) invalid("body", "Add the text reps will copy");
    if (body.length > bodyMax) {
      invalid("body", `Keep it under ${bodyMax} characters`);
    }
    const seen = new Set<string>();
    const tags = args.tags.flatMap((raw) => {
      const tag = cleanText(raw);
      if (!tag || seen.has(tag.toLowerCase())) return [];
      seen.add(tag.toLowerCase());
      return [tag];
    });
    if (tags.length > maxTags) invalid("tags", `Use at most ${maxTags} tags`);
    if (tags.some((tag) => tag.length > tagMax)) {
      invalid("tags", `Keep each tag under ${tagMax} characters`);
    }

    const fields = {
      kind: args.kind,
      title,
      body,
      tags,
      searchText: `${title}\n${body}`,
      updatedAt: Date.now(),
      updatedById: ctx.viewer._id,
    };
    if (!args.id) return await ctx.db.insert("playbook", fields);
    if (!(await ctx.db.get(args.id))) notFound("Playbook entry");
    await ctx.db.patch(args.id, fields);
    return args.id;
  },
});

export const remove = managerMutation({
  args: { id: v.id("playbook") },
  handler: async (ctx, { id }) => {
    if (!(await ctx.db.get(id))) notFound("Playbook entry");
    await ctx.db.delete(id);
  },
});

/** Run once on a fresh workspace; does nothing when the playbook already has entries. */
export const seedStarter = internalMutation({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .take(50);
    const owner = members.find((m) => m.role === "admin") ?? members[0];
    if (!owner) invalid("members", "Sign in once before seeding the playbook");
    return await insertStarter(ctx, owner._id);
  },
});
