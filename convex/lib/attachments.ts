import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export const MAX_ATTACHMENTS = 100;

export type AttachmentTarget =
  | { accountId: Id<"accounts"> }
  | { personId: Id<"people"> }
  | { dealId: Id<"deals"> }
  | { leadId: Id<"leads"> };

export function attachmentsOf(ctx: QueryCtx, target: AttachmentTarget) {
  const table = ctx.db.query("attachments");
  if ("accountId" in target) {
    return table.withIndex("by_account", (q) =>
      q.eq("accountId", target.accountId),
    );
  }
  if ("personId" in target) {
    return table.withIndex("by_person", (q) =>
      q.eq("personId", target.personId),
    );
  }
  if ("dealId" in target) {
    return table.withIndex("by_deal", (q) => q.eq("dealId", target.dealId));
  }
  return table.withIndex("by_lead", (q) => q.eq("leadId", target.leadId));
}

/** Deletes a record's files from storage and the table, e.g. when its data is erased. */
export async function deleteAttachments(
  ctx: MutationCtx,
  target: AttachmentTarget,
) {
  for (const row of await attachmentsOf(ctx, target).take(MAX_ATTACHMENTS)) {
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(row._id);
  }
}
