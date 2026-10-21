import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./lib/functions";

/**
 * Data migrations: add one with `migrations.define({ table, migrateOne })`, deploy,
 * then `npx convex run migrations:run '{"fn": "migrations:<name>"}'`. Progress is
 * resumable and `'{"fn": …, "dryRun": true}'` previews the first batch.
 */
export const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
});

export const run = migrations.runner();

/**
 * One proposal per deal: the accepted one, else the newest, stays. Older ones
 * are summarised on the deal's timeline and deleted.
 */
export const singleProposal = migrations.define({
  table: "proposals",
  migrateOne: async (ctx, proposal) => {
    const siblings = await ctx.db
      .query("proposals")
      .withIndex("by_deal", (q) => q.eq("dealId", proposal.dealId))
      .collect();
    const keeper =
      siblings.find((row) => row.status === "accepted") ??
      siblings.reduce((newest, row) =>
        (row.version ?? 0) > (newest.version ?? 0) ? row : newest,
      );
    if (keeper._id !== proposal._id) {
      const deal = await ctx.db.get(proposal.dealId);
      if (deal) {
        await ctx.db.insert("timeline", {
          kind: "system",
          accountId: deal.accountId,
          dealId: deal._id,
          occurredAt: proposal.updatedAt,
          subject: `retired an earlier proposal (v${proposal.version ?? 1}, ${proposal.status})`,
          body: `${proposal.lines.length} ${proposal.lines.length === 1 ? "line" : "lines"}: ${proposal.lines.map((line) => line.product || "Untitled").join(", ")}`,
        });
      }
      await ctx.db.delete(proposal._id);
      return;
    }
    if (proposal.version === undefined && !proposal.policy?.approvalBps) return;
    const { approvalBps, ...policy } = proposal.policy ?? {};
    void approvalBps;
    return {
      version: undefined,
      policy: proposal.policy ? (policy as typeof proposal.policy) : undefined,
    };
  },
});

export const dropApprovalThreshold = migrations.define({
  table: "settings",
  migrateOne: async (ctx, setting) => {
    if (setting.key === "pricing.approvalBps") await ctx.db.delete(setting._id);
  },
});

/** Done becomes archived; snoozed notifications return to the inbox as they were. */
export const archiveNotifications = migrations.define({
  table: "notifications",
  migrateOne: async (_ctx, item) => {
    if (item.doneAt === undefined && item.snoozedUntil === undefined) return;
    return {
      archivedAt: item.archivedAt ?? item.doneAt,
      doneAt: undefined,
      snoozedUntil: undefined,
    };
  },
});

export const dropNotificationPrefs = migrations.define({
  table: "notificationPrefs",
  migrateOne: async (ctx, prefs) => {
    await ctx.db.delete(prefs._id);
  },
});

export const dropTimelineAcks = migrations.define({
  table: "timeline",
  migrateOne: async (_ctx, entry) =>
    entry.acks === undefined ? undefined : { acks: undefined },
});

export const runSimplify = migrations.runner([
  internal.migrations.singleProposal,
  internal.migrations.dropApprovalThreshold,
  internal.migrations.archiveNotifications,
  internal.migrations.dropNotificationPrefs,
  internal.migrations.dropTimelineAcks,
]);
