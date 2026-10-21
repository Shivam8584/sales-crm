import { v } from "convex/values";
import { memberMutation } from "./lib/functions";
import { fail, notFound } from "./lib/errors";

/** Toggles the signed-in member's acknowledgement of someone else's entry. */
export const acknowledge = memberMutation({
  args: { id: v.id("timeline") },
  handler: async (ctx, { id }) => {
    const entry = await ctx.db.get(id);
    if (!entry) notFound("Entry");
    if (entry.kind === "change" || entry.kind === "system") {
      fail("forbidden", "Automatic entries can't be acknowledged");
    }
    if (entry.actorId === ctx.viewer._id) {
      fail("forbidden", "You can't acknowledge your own entry");
    }
    const acks = entry.acks ?? [];
    const acked = acks.includes(ctx.viewer._id);
    await ctx.db.patch(id, {
      acks: acked
        ? acks.filter((member) => member !== ctx.viewer._id)
        : [...acks, ctx.viewer._id],
    });
    return { acked: !acked };
  },
});
