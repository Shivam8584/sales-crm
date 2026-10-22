import { internal } from "../_generated/api";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { SECRET_KEYS } from "../../lib/domain/secrets";
import { decryptSecret, encryptionConfigured } from "./crypto";

type Ctx = QueryCtx | MutationCtx | ActionCtx;
export type Env = Record<string, string | undefined>;

const fromEnv = (name: string) => process.env[name]?.trim() || undefined;

type Row = { name: string; value: string };

async function storedRows(ctx: Ctx, name?: string): Promise<Row[]> {
  if (!("db" in ctx)) {
    return await ctx.runQuery(internal.secrets.rows, { name });
  }
  const rows = ctx.db.query("secrets");
  return name
    ? await rows.withIndex("by_name", (q) => q.eq("name", name)).take(1)
    : await rows.take(SECRET_KEYS.length);
}

async function open(row: Row): Promise<string | undefined> {
  try {
    return await decryptSecret(row.value, row.name);
  } catch {
    console.error("A stored key can't be decrypted", row.name);
    return undefined;
  }
}

/** An environment variable wins over a key stored in Settings. */
export async function getSecret(
  ctx: Ctx,
  name: string,
): Promise<string | undefined> {
  const env = fromEnv(name);
  if (env || !encryptionConfigured()) return env;
  const [row] = await storedRows(ctx, name);
  return row ? await open(row) : undefined;
}

/** `process.env` with the stored keys filled in where the environment doesn't set them. */
export async function secretEnv(ctx: Ctx): Promise<Env> {
  if (!encryptionConfigured()) return process.env;
  const merged: Env = { ...process.env };
  for (const row of await storedRows(ctx)) {
    if (fromEnv(row.name)) continue;
    merged[row.name] = await open(row);
  }
  return merged;
}
