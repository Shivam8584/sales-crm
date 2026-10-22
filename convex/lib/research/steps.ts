import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { STEP_RETENTION_MS } from "../../../lib/domain/research";
import type { Subject } from "./queue";

const SWEEP = 100;

export async function addSteps(
  ctx: MutationCtx,
  subject: Subject,
  lines: string[],
) {
  for (const text of lines)
    await ctx.db.insert("researchSteps", { ...subject, text });
}

export function recentSteps(ctx: QueryCtx, subject: Subject, limit: number) {
  const steps = ctx.db.query("researchSteps");
  return (
    "accountId" in subject
      ? steps.withIndex("by_account", (q) =>
          q.eq("accountId", subject.accountId),
        )
      : steps.withIndex("by_person", (q) => q.eq("personId", subject.personId))
  )
    .order("desc")
    .take(limit);
}

export async function sweepSteps(ctx: MutationCtx, now: number) {
  const old = await ctx.db
    .query("researchSteps")
    .withIndex("by_creation_time", (q) =>
      q.lt("_creationTime", now - STEP_RETENTION_MS),
    )
    .take(SWEEP);
  for (const step of old) await ctx.db.delete(step._id);
}
