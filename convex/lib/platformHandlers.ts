import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { checkGstin, panRoot } from "../../lib/domain/gstin";
import { companyDomain } from "../../lib/domain/leads";
import {
  campaignTransition,
  type PlatformEventData,
  type PlatformEventType,
} from "../../lib/domain/platform";
import { nextOwner } from "./assignment";
import { createLead, isOpen, leadHref, rescoreLead } from "./leads";
import { findAccount, findPerson } from "./identity";
import { logSystem, type RecordRefs } from "./timeline";
import { leadershipIds, notify, notifyMany } from "../notifications";
import { routes } from "../../lib/routes";
import { describeEvent } from "./platformDescribe";
import {
  accountForOrg,
  personByPlatformUser,
  signupEvent,
  upsertMember,
} from "./platformLinks";
import { touchAccount } from "./platformStage";
import {
  accountByDomain,
  emailDomain,
  fullName,
  latestLead,
  linkPerson,
  log,
  personByEmail,
  signupData,
} from "./platformLinks";

export type Outcome =
  | { status: "processed"; refs: RecordRefs }
  | { status: "pending" }
  | { error: string };

export async function onSignedUp(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData["user.signed_up"],
): Promise<Outcome> {
  const domainAccount = await accountByDomain(ctx, emailDomain(data.email));
  const known = await findPerson(ctx, {
    platformUserId: data.user_id,
    email: data.email,
    phone: data.phone,
  });

  if (known) {
    const person = await linkPerson(
      ctx,
      known,
      { platformUserId: data.user_id, account: domainAccount },
      event.occurredAt,
    );
    const account = person.accountId
      ? await ctx.db.get(person.accountId)
      : null;
    const change = account
      ? await touchAccount(ctx, account, event, data)
      : null;
    await log(
      ctx,
      { personId: person._id, accountId: account?._id },
      event,
      describeEvent("user.signed_up", data, fullName(person)),
      change,
    );
    return {
      status: "processed",
      refs: { personId: person._id, accountId: account?._id },
    };
  }

  const name =
    data.name ?? data.email?.split("@")[0] ?? data.phone ?? "New signup";
  const existing = await latestLead(ctx, data.email);
  let leadId: Id<"leads">;
  if (existing && isOpen(existing)) {
    leadId = existing._id;
    await ctx.db.patch(existing._id, {
      phone: existing.phone ?? data.phone,
      accountId: existing.accountId ?? domainAccount?._id,
    });
    const input = {
      kind: "lead_signup",
      title: `${existing.name} signed up on Hypedrive`,
      body: existing.companyName,
      href: leadHref(existing._id),
    };
    if (existing.ownerId) await notify(ctx, existing.ownerId, input);
    else await notifyMany(ctx, await leadershipIds(ctx), input);
  } else {
    const domain = emailDomain(data.email);
    const created = await createLead(ctx, {
      kind: "signup",
      source: "platform",
      name,
      email: data.email,
      phone: data.phone,
      companyName: domainAccount?.name ?? domain ?? name,
      website: domain ?? undefined,
      utm: data.utm ?? {},
    });
    leadId = created.id;
    if (domainAccount)
      await ctx.db.patch(leadId, { accountId: domainAccount._id });
    await rescoreLead(ctx, leadId);
  }
  const change = domainAccount
    ? await touchAccount(ctx, domainAccount, event, data)
    : null;
  await log(
    ctx,
    { leadId, accountId: domainAccount?._id },
    event,
    describeEvent("user.signed_up", data, name),
    change,
  );
  return {
    status: "processed",
    refs: { leadId, accountId: domainAccount?._id },
  };
}

export async function onOrgCreated(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData["organization.created"],
): Promise<Outcome> {
  const creator = await personByPlatformUser(ctx, data.created_by);
  const signup = creator
    ? null
    : signupData(await signupEvent(ctx, data.created_by));
  const email = creator?.email ?? signup?.email;
  const person = creator ?? (email ? await personByEmail(ctx, email) : null);
  const lead = await latestLead(ctx, email);
  const gst = data.gstin ? checkGstin(data.gstin) : null;
  const verified: Partial<Doc<"accounts">> =
    gst?.ok === true
      ? { gstin: gst.gstin, panRoot: panRoot(gst.gstin) ?? undefined }
      : {};

  let account = await accountForOrg(ctx, data.org_id);
  let created = false;
  if (!account) {
    const unlinked = (candidate: Doc<"accounts"> | null) =>
      candidate && !candidate.archivedAt && !candidate.platformOrgId
        ? candidate
        : null;
    account =
      (gst?.ok
        ? await findAccount(
            ctx,
            { gstin: gst.gstin, domain: data.website },
            { unlinkedOnly: true },
          )
        : null) ??
      unlinked(await accountByDomain(ctx, companyDomain(data.website))) ??
      unlinked(person?.accountId ? await ctx.db.get(person.accountId) : null) ??
      unlinked(lead?.accountId ? await ctx.db.get(lead.accountId) : null) ??
      unlinked(await accountByDomain(ctx, emailDomain(email)));
    if (account) {
      await ctx.db.patch(account._id, { platformOrgId: data.org_id });
      account = { ...account, platformOrgId: data.org_id };
    } else {
      const ownerId =
        lead?.ownerId ?? person?.ownerId ?? (await nextOwner(ctx));
      if (!ownerId) return { error: "no active member to own the account" };
      const now = Date.now();
      const accountId = await ctx.db.insert("accounts", {
        name: data.name,
        domain: companyDomain(data.website) ?? undefined,
        ownerId,
        stage: "org_created",
        tags: [],
        platformOrgId: data.org_id,
        ...verified,
        lastActivityAt: event.occurredAt,
        updatedAt: now,
      });
      account = (await ctx.db.get(accountId))!;
      created = true;
      await notify(ctx, ownerId, {
        kind: "platform_org",
        title: `New on Hypedrive: ${data.name}`,
        body: "Organisation created with a verified GSTIN",
        href: routes.account(accountId),
      });
    }
  }

  if (person) {
    await linkPerson(
      ctx,
      person,
      { platformUserId: data.created_by, account },
      event.occurredAt,
    );
  }
  if (lead && !lead.accountId) {
    await ctx.db.patch(lead._id, { accountId: account._id });
    await rescoreLead(ctx, lead._id);
  }
  if (created) {
    const entry = await logSystem(
      ctx,
      { accountId: account._id },
      "created the account",
    );
    await ctx.db.patch(entry, { occurredAt: event.occurredAt });
  }
  const change = created
    ? null
    : await touchAccount(
        ctx,
        account,
        event,
        data,
        account.gstin ? {} : verified,
      );
  await log(
    ctx,
    { accountId: account._id, personId: person?._id },
    event,
    describeEvent("organization.created", data, account.name),
    change,
  );
  return {
    status: "processed",
    refs: { accountId: account._id, personId: person?._id },
  };
}

/** v2 GST failures belong to a user with no org yet: their person or lead, and the account their email domain points at. */
export async function onUserGstFailed(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  data: PlatformEventData["organization.gst_failed"] & { user_id: string },
): Promise<Outcome> {
  const signup = signupData(await signupEvent(ctx, data.user_id));
  const email = data.email ?? signup?.email;
  const known =
    (await personByPlatformUser(ctx, data.user_id)) ??
    (email ? await personByEmail(ctx, email) : null);
  const lead = known ? null : await latestLead(ctx, email);
  if (!known && !lead) return { status: "pending" };

  const domainAccount = await accountByDomain(ctx, emailDomain(email));
  const person = known
    ? await linkPerson(
        ctx,
        known,
        { platformUserId: data.user_id, account: domainAccount },
        event.occurredAt,
      )
    : null;
  const accountId =
    person?.accountId ?? lead?.accountId ?? domainAccount?._id ?? undefined;
  const account = accountId ? await ctx.db.get(accountId) : null;
  if (account) {
    await ctx.db.patch(account._id, {
      lastActivityAt: Math.max(account.lastActivityAt ?? 0, event.occurredAt),
      updatedAt: Date.now(),
    });
  }
  const who = person ? fullName(person) : lead!.name;
  await log(
    ctx,
    { personId: person?._id, leadId: lead?._id, accountId: account?._id },
    event,
    describeEvent("organization.gst_failed", data, who),
  );
  const recipient = account?.ownerId ?? lead?.ownerId ?? person?.ownerId;
  const input = {
    kind: "platform_gst_failed",
    title: `${who} couldn't verify GST on Hypedrive`,
    body: data.reason,
    href: account
      ? routes.account(account._id)
      : person
        ? routes.person(person._id)
        : leadHref(lead!._id),
  };
  if (recipient) await notify(ctx, recipient, input);
  else await notifyMany(ctx, await leadershipIds(ctx), input);
  return {
    status: "processed",
    refs: { personId: person?._id, leadId: lead?._id, accountId: account?._id },
  };
}

async function onMemberJoined(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  account: Doc<"accounts">,
  data: PlatformEventData["member.joined"],
) {
  const result = await upsertMember(
    ctx,
    account,
    {
      userId: data.user_id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      roles: [data.role],
    },
    event.occurredAt,
  );
  return result?.personId;
}

/** Owner alerts for events a rep should act on today. */
async function alertOwner(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  type: PlatformEventType,
  data: Record<string, unknown>,
) {
  const move = campaignTransition(type, data);
  const title =
    move?.pauseReason === "insufficient_funds"
      ? `${account.name}'s campaign paused: out of funds`
      : type === "wallet.negative"
        ? `${account.name}'s wallet went negative`
        : type === "campaign.slots_filled"
          ? `${account.name} sold out a campaign`
          : null;
  if (!title) return;
  await notify(ctx, account.ownerId, {
    kind: `platform_${type.replace(".", "_")}`,
    title,
    body:
      type === "campaign.slots_filled"
        ? "Every slot is taken: a good moment to talk about the next one."
        : "They need to top up, and paused campaigns must be resumed by hand.",
    href: routes.account(account._id),
  });
}

export async function onOrgEvent(
  ctx: MutationCtx,
  event: Doc<"platformEvents">,
  type: PlatformEventType,
  data: PlatformEventData[PlatformEventType] & { org_id: string },
): Promise<Outcome> {
  const account = await accountForOrg(ctx, data.org_id);
  if (!account) return { status: "pending" };

  const patch: Partial<Doc<"accounts">> = {};
  if (type === "organization.gst_verified") {
    const check = checkGstin(
      (data as PlatformEventData["organization.gst_verified"]).gstin,
    );
    if (!check.ok) return { error: `invalid GSTIN (${check.reason})` };
    patch.gstin = check.gstin;
    patch.panRoot = panRoot(check.gstin) ?? undefined;
  }
  const record = data as Record<string, unknown>;
  const change = await touchAccount(ctx, account, event, record, patch);
  const personId =
    type === "member.joined"
      ? await onMemberJoined(
          ctx,
          event,
          account,
          data as PlatformEventData["member.joined"],
        )
      : undefined;
  await log(
    ctx,
    { accountId: account._id, personId },
    event,
    describeEvent(type, data, account.name),
    change,
  );
  await alertOwner(ctx, account, type, record);
  return { status: "processed", refs: { accountId: account._id, personId } };
}
