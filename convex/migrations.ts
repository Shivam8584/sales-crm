import { Migrations } from "@convex-dev/migrations";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { internalMutation } from "./lib/functions";
import { scoreFor } from "./lib/leads";
import { fromLegacyPath } from "../lib/routes";

/**
 * Data migrations: add one with `migrations.define({ table, migrateOne })`, deploy,
 * then `npx convex run migrations:run '{"fn": "migrations:<name>"}'`. Progress is
 * resumable and `'{"fn": …, "dryRun": true}'` previews the first batch.
 */
export const migrations = new Migrations<DataModel>(components.migrations, {
  internalMutation,
});

export const scoreLeads = migrations.define({
  table: "leads",
  migrateOne: async (ctx, lead) => {
    const { score, reasons } = await scoreFor(ctx, lead);
    return { score, scoreReasons: reasons };
  },
});

export const notificationLinks = migrations.define({
  table: "notifications",
  migrateOne: (_ctx, row) => {
    if (!row.href) return;
    const href = fromLegacyPath(row.href);
    if (href !== row.href) return { href };
  },
});

export const savedViewPaths = migrations.define({
  table: "savedViews",
  migrateOne: (_ctx, row) => {
    const path = fromLegacyPath(row.path);
    if (path !== row.path) return { path };
  },
});

export const run = migrations.runner();

/** Every migration in order: `npx convex run migrations:runAll`. */
export const runAll = migrations.runner([
  internal.migrations.scoreLeads,
  internal.migrations.notificationLinks,
  internal.migrations.savedViewPaths,
]);
