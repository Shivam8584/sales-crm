import { v } from "convex/values";
import { memberMutation, memberQuery } from "./lib/functions";
import { fail, invalid, notFound } from "./lib/errors";

const MAX_PER_PAGE = 12;
const MAX_NAME = 40;

/** The signed-in member's saved views for one list page. */
export const forPath = memberQuery({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const views = await ctx.db
      .query("savedViews")
      .withIndex("by_member_path", (q) =>
        q.eq("memberId", ctx.viewer._id).eq("path", path),
      )
      .collect();
    return views.map(({ _id, name, query }) => ({ _id, name, query }));
  },
});

export const save = memberMutation({
  args: { path: v.string(), name: v.string(), query: v.string() },
  handler: async (ctx, { path, name, query }) => {
    const label = name.trim().slice(0, MAX_NAME);
    if (!label) invalid("name", "Give the view a name");
    if (!path.startsWith("/")) invalid("path", "Unknown page");
    const existing = await ctx.db
      .query("savedViews")
      .withIndex("by_member_path", (q) =>
        q.eq("memberId", ctx.viewer._id).eq("path", path),
      )
      .collect();
    const same = existing.find((view) => view.name === label);
    if (same) {
      await ctx.db.patch(same._id, { query });
      return same._id;
    }
    if (existing.length >= MAX_PER_PAGE)
      fail("conflict", `You can keep ${MAX_PER_PAGE} views per page`);
    return await ctx.db.insert("savedViews", {
      memberId: ctx.viewer._id,
      path,
      name: label,
      query,
    });
  },
});

export const remove = memberMutation({
  args: { id: v.id("savedViews") },
  handler: async (ctx, { id }) => {
    const view = await ctx.db.get(id);
    if (!view || view.memberId !== ctx.viewer._id) notFound("View");
    await ctx.db.delete(id);
  },
});
