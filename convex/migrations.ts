import { Migrations } from "@convex-dev/migrations";
import { components } from "./_generated/api";
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
