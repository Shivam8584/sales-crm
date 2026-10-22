import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  DEFAULT_LOG_ADDRESS,
  OWN_DOMAIN,
  domainOf,
} from "../../lib/domain/email-log";
import { normalizeEmail } from "../../lib/domain/normalize";
import { markFirstTouch, touch } from "../timeline";
import { notifyFollowers } from "./follows";
import { onReply } from "./research/queue";
import type { RecordRefs } from "./timeline";

export const logAddress = () =>
  normalizeEmail(process.env.INBOUND_LOG_ADDRESS ?? "") ?? DEFAULT_LOG_ADDRESS;

export const ownDomains = () =>
  [OWN_DOMAIN, domainOf(process.env.EMAIL_FROM)].filter(
    (domain) => domain !== null,
  );

export async function activeMemberByEmail(ctx: QueryCtx, email: string) {
  const member = await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .first();
  return member?.status === "active" ? member : null;
}

export async function activeMemberEmails(ctx: QueryCtx) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  return new Set(members.map((member) => member.email));
}

/**
 * One email entry on a record. A rep's outbound email counts like a manually
 * logged one (first touch, last activity); a forwarded customer email only
 * moves last activity.
 */
export async function logEmail(
  ctx: MutationCtx,
  input: {
    refs: RecordRefs;
    lead: Doc<"leads"> | null;
    actorId?: Id<"members">;
    direction: "inbound" | "outbound";
    subject: string;
    body: string;
    at: number;
    link?: string;
    /** Skip follower notifications, for history imported after the fact. */
    quiet?: boolean;
  },
) {
  const entry = {
    ...input.refs,
    kind: "email" as const,
    actorId: input.actorId,
    direction: input.direction,
    occurredAt: input.at,
    subject: input.subject,
    body: input.body || undefined,
    link: input.link,
  };
  const id = await ctx.db.insert("timeline", entry);
  await touch(ctx, input.refs, input.at);
  if (!input.quiet) await notifyFollowers(ctx, { _id: id, ...entry });
  if (input.direction === "inbound" && input.refs.personId && !input.quiet) {
    await onReply(ctx, input.refs.personId, input.body);
  }
  if (input.actorId) {
    await markFirstTouch(ctx, input.lead, input.actorId, "email", input.at);
  }
  return id;
}
