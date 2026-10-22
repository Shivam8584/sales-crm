import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { LifecycleStage } from "../../lib/domain/enums";
import { STAGE_LABEL } from "../../lib/domain/labels";
import { companyDomain, splitName } from "../../lib/domain/leads";
import {
  ORG_ROLE_TAG,
  ORG_ROLE_TITLE,
  type OrgRole,
} from "../../lib/domain/platform";
import { isOpen } from "./leads";
import { findAccount, findPerson } from "./identity";
import { firstLive } from "./merged";
import { personSearchText } from "./records";
import { logSystem, type RecordRefs } from "./timeline";
import { parseEventData, payloadOf } from "./platformParse";
import { email, phone } from "./platformParse";

export type StageChange = { from: LifecycleStage; to: LifecycleStage } | null;

/** Timeline entries for an event, dated when it happened on the platform rather than when it arrived. */
export async function log(
  ctx: MutationCtx,
  refs: RecordRefs,
  event: Doc<"platformEvents">,
  text: { subject: string; body?: string },
  change: StageChange = null,
) {
  const id = await logSystem(ctx, refs, text.subject, text.body);
  await ctx.db.patch(id, { occurredAt: event.occurredAt });
  if (change && refs.accountId) {
    await ctx.db.insert("timeline", {
      kind: "change",
      accountId: refs.accountId,
      occurredAt: event.occurredAt,
      changes: [
        {
          field: "Stage",
          from: STAGE_LABEL[change.from],
          to: STAGE_LABEL[change.to],
        },
      ],
    });
  }
}

const LINK_ROWS = 5;

/** Archived accounts never receive platform data; a merged one hands it to its winner. */
export async function accountForOrg(ctx: QueryCtx, orgId: string) {
  const rows = await ctx.db
    .query("accounts")
    .withIndex("by_platform_org", (q) => q.eq("platformOrgId", orgId))
    .take(LINK_ROWS);
  return await firstLive(rows, (id) => ctx.db.get(id));
}

export async function personByPlatformUser(ctx: QueryCtx, userId: string) {
  const rows = await ctx.db
    .query("people")
    .withIndex("by_platform_user", (q) => q.eq("platformUserId", userId))
    .take(LINK_ROWS);
  return await firstLive(rows, (id) => ctx.db.get(id));
}

export async function personByEmail(ctx: QueryCtx, email: string) {
  return await findPerson(ctx, { email });
}

export async function accountByDomain(ctx: QueryCtx, domain: string | null) {
  return domain ? await findAccount(ctx, { domain }) : null;
}

export function emailDomain(email: string | undefined) {
  return email ? companyDomain(email.split("@")[1]) : null;
}

/** The stored `user.signed_up` event for a platform user. */
export async function signupEvent(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("platformEvents")
    .withIndex("by_user_type", (q) =>
      q.eq("userId", userId).eq("type", "user.signed_up"),
    )
    .first();
}

/** GST failures a platform user hit before they had an organisation. */
export async function gstFailures(ctx: QueryCtx, userId: string) {
  return await ctx.db
    .query("platformEvents")
    .withIndex("by_user_type", (q) =>
      q.eq("userId", userId).eq("type", "organization.gst_failed"),
    )
    .collect();
}

export function signupData(event: Doc<"platformEvents"> | null) {
  if (!event) return null;
  const parsed = parseEventData("user.signed_up", payloadOf(event));
  return parsed.ok ? parsed.value : null;
}

export async function latestLead(ctx: QueryCtx, email: string | undefined) {
  if (!email) return null;
  const leads = await ctx.db
    .query("leads")
    .withIndex("by_email", (q) => q.eq("email", email))
    .order("desc")
    .take(20);
  return (
    leads.find(isOpen) ??
    leads.find((lead) => lead.status === "converted") ??
    null
  );
}

export function fullName(
  person: Pick<Doc<"people">, "firstName" | "lastName">,
) {
  return `${person.firstName} ${person.lastName}`.trim();
}

export async function linkPerson(
  ctx: MutationCtx,
  person: Doc<"people">,
  link: { platformUserId?: string; account?: Doc<"accounts"> | null },
  occurredAt: number,
) {
  const patch: Partial<Doc<"people">> = {
    updatedAt: Date.now(),
    lastActivityAt: Math.max(person.lastActivityAt ?? 0, occurredAt),
  };
  if (link.platformUserId && !person.platformUserId) {
    patch.platformUserId = link.platformUserId;
  }
  if (link.account && !person.accountId) {
    patch.accountId = link.account._id;
    patch.searchText = personSearchText(person, link.account.name);
  }
  await ctx.db.patch(person._id, patch);
  return { ...person, ...patch };
}

export type PlatformMember = {
  userId: string;
  name?: string;
  email?: string;
  phone?: string;
  roles: string[];
};

const ROLE_ORDER: OrgRole[] = [
  "owner",
  "finance_manager",
  "admin",
  "campaign_manager",
  "member",
];

/** The member's most telling role: owner first, then the billing contact. */
export function primaryRole(roles: string[]): OrgRole {
  return ROLE_ORDER.find((role) => roles.includes(role)) ?? "member";
}

/**
 * Makes a platform member a person on the account, matched by platform user id
 * and then email. Fills the title and role tags without overwriting a rep's edits.
 */
export async function upsertMember(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  member: PlatformMember,
  occurredAt: number,
): Promise<{ personId: Id<"people">; created: boolean } | null> {
  const role = primaryRole(member.roles);
  const memberEmail = member.email ? email(member.email) : undefined;
  const byUser = await personByPlatformUser(ctx, member.userId);
  if (byUser?.erasedAt) return null;
  const known =
    byUser ??
    (await findPerson(ctx, {
      email: memberEmail,
      phone: member.phone ? phone(member.phone) : undefined,
    }));
  const tags = member.roles.flatMap(
    (item) => ORG_ROLE_TAG[item as OrgRole] ?? [],
  );

  if (known) {
    if (known.erasedAt) return null;
    const linked = await linkPerson(
      ctx,
      known,
      { platformUserId: member.userId, account },
      occurredAt,
    );
    const patch: Partial<Doc<"people">> = {};
    if (!linked.title) patch.title = ORG_ROLE_TITLE[role];
    const memberPhone = member.phone ? phone(member.phone) : undefined;
    if (
      !linked.phone &&
      memberPhone &&
      !(await findPerson(ctx, { phone: memberPhone }, known._id))
    ) {
      patch.phone = memberPhone;
    }
    const missing = tags.filter((tag) => !linked.tags.includes(tag));
    if (missing.length) patch.tags = [...linked.tags, ...missing];
    if (Object.keys(patch).length) {
      const next = { ...linked, ...patch };
      patch.searchText = personSearchText(
        next,
        linked.accountId === account._id ? account.name : undefined,
      );
      await ctx.db.patch(known._id, patch);
    }
    return { personId: known._id, created: false };
  }

  const fallback = memberEmail?.split("@")[0] ?? "Team member";
  const { firstName, lastName } = splitName(member.name || fallback);
  const fields = {
    firstName: firstName || fallback,
    lastName,
    email: memberEmail,
    phone: member.phone ? phone(member.phone) : undefined,
    title: ORG_ROLE_TITLE[role],
  };
  const now = Date.now();
  const personId = await ctx.db.insert("people", {
    ...fields,
    accountId: account._id,
    ownerId: account.ownerId,
    tags,
    platformUserId: member.userId,
    lastActivityAt: occurredAt,
    updatedAt: now,
    searchText: personSearchText(fields, account.name),
  });
  const entry = await logSystem(
    ctx,
    { accountId: account._id, personId },
    `added ${fullName(fields)} from the Hypedrive team (${ORG_ROLE_TITLE[role]})`,
  );
  await ctx.db.patch(entry, { occurredAt });
  return { personId, created: true };
}
