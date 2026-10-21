import { v } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { formatMoney, type Money } from "../lib/domain/money";
import {
  DEFAULT_PAYMENT,
  DEFAULT_TERMS,
  DEFAULT_VALIDITY_DAYS,
  PROPOSAL_CURRENCY,
  approvalPayload,
  approvalReasons,
  freezeLines,
  priceLines,
  pricingFingerprint,
  rateLabel,
  type PricingPolicy,
  type ProposalLine,
  type ProposalPricing,
} from "../lib/domain/pricing";
import { istToday } from "../lib/domain/day";
import { proposalMoveProblem, type Problem } from "../lib/domain/transitions";
import type { ProposalStatus } from "../lib/domain/pricing";
import { fail, invalid } from "./lib/errors";
import { canDecideApproval } from "./lib/permissions";
import {
  managerMutation,
  memberMutation,
  memberQuery,
  type Viewer,
} from "./lib/functions";
import { assertMoney } from "./lib/money";
import { leadershipIds, notify, notifyMany } from "./notifications";
import {
  applyLinePatch,
  checkLineCount,
  cleanLine,
  cleanPayment,
  cleanReason,
  cleanTerms,
  cleanValidUntil,
  requireDeal,
  requireProposal,
  vApproval,
  vProposalLine,
  vLinePatch,
  vPayment,
  vPolicy,
  vProposalStatus,
  versionLabel,
} from "./lib/pricing";
import { memberIndex, memberRef } from "./lib/records";
import { pricingPolicy, storedPricingPolicy } from "./lib/settings";
import { logChanges, logSystem } from "./lib/timeline";
import { vCurrency, vDay, vMoney } from "./lib/validators";

const MAX_KEY_LENGTH = 40;

type Ctx = MutationCtx & { viewer: Viewer };
type Priced = Pick<Doc<"proposals">, "lines" | "policy">;

function requireMove(proposal: Doc<"proposals">, to: ProposalStatus) {
  const problem: Problem | null = proposalMoveProblem(proposal.status, to);
  if (problem) fail("conflict", problem.message);
}

async function versions(ctx: QueryCtx, dealId: Id<"deals">) {
  return await ctx.db
    .query("proposals")
    .withIndex("by_deal", (q) => q.eq("dealId", dealId))
    .order("desc")
    .collect();
}

function requireDraft(proposal: Doc<"proposals">) {
  if (proposal.status !== "draft") {
    fail(
      "conflict",
      "Sent proposals are frozen; start a new version to change it",
    );
  }
}

/** Sent versions keep the policy they were priced under; drafts follow the live one. */
function policyFor(proposal: Priced, live: PricingPolicy): PricingPolicy {
  return proposal.policy ?? live;
}

function takeOf(pricing: ProposalPricing): Money {
  return {
    amount: Math.max(0, pricing.total.take),
    currency: PROPOSAL_CURRENCY,
  };
}

function summaryLine(pricing: ProposalPricing) {
  return `${formatMoney(takeOf(pricing))} take · ${rateLabel(pricing.marginRate)} blended margin`;
}

/** A proposal has to be complete and platform-valid before it is sent or approved. */
function requireComplete(lines: ProposalLine[], pricing: ProposalPricing) {
  if (lines.length === 0) invalid("lines", "Add at least one line");
  const [issue] = pricing.issues;
  if (issue) invalid("lines", `Line ${issue.index + 1}: ${issue.message}`);
}

async function log(
  ctx: Ctx,
  deal: Doc<"deals">,
  subject: string,
  body?: string,
) {
  await logSystem(
    ctx,
    { accountId: deal.accountId, dealId: deal._id },
    subject,
    body,
    ctx.viewer._id,
  );
}

/** Pricing changes void a decision, so an approval always matches the numbers sent. */
function keepApproval(
  proposal: Doc<"proposals">,
  before: ProposalLine[],
  after: ProposalLine[],
) {
  const approval = proposal.approval;
  if (!approval || approval.state === "requested") return approval;
  const priced = (lines: ProposalLine[]) =>
    JSON.stringify(lines.map(pricingFingerprint));
  return priced(before) === priced(after) ? approval : undefined;
}

async function saveLines(
  ctx: Ctx,
  proposal: Doc<"proposals">,
  lines: ProposalLine[],
) {
  await ctx.db.patch(proposal._id, {
    lines,
    approval: keepApproval(proposal, proposal.lines, lines),
    updatedAt: Date.now(),
  });
}

function findLine(proposal: Doc<"proposals">, key: string) {
  const index = proposal.lines.findIndex((line) => line.key === key);
  if (index === -1) fail("not_found", "That line was removed");
  return index;
}

/** The live pricing policy, its defaults and the platform's own floor. */
export const policy = memberQuery({
  args: {},
  handler: async (ctx) => {
    const stored = await storedPricingPolicy(ctx);
    return {
      policy: await pricingPolicy(ctx),
      isDefault: {
        marginFloorBps: stored.marginFloorBps === undefined,
        approvalBps: stored.approvalBps === undefined,
        defaultMarginBps: stored.defaultMarginBps === undefined,
        defaultFundBps: stored.defaultFundBps === undefined,
        defaultFeeBps: stored.defaultFeeBps === undefined,
        defaultBonusFeeBps: stored.defaultBonusFeeBps === undefined,
      },
      platformFloorFromEnv: {
        rate: Boolean(process.env.PLATFORM_MIN_MARGIN_RATE),
        minimum: Boolean(process.env.PLATFORM_MIN_MARGIN_ABS),
      },
    };
  },
});

/** Every version for a deal, newest first, with names resolved and the policy each is priced under. */
export const forDeal = memberQuery({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const [rows, members, live] = await Promise.all([
      versions(ctx, dealId),
      memberIndex(ctx),
      pricingPolicy(ctx),
    ]);
    return rows.map((proposal) => ({
      ...proposal,
      policy: policyFor(proposal, live),
      payment: proposal.payment ?? DEFAULT_PAYMENT,
      createdBy: memberRef(members, proposal.createdById),
      approval: proposal.approval
        ? {
            ...proposal.approval,
            requestedBy: memberRef(members, proposal.approval.requestedById),
            decidedBy: memberRef(members, proposal.approval.decidedById),
          }
        : null,
    }));
  },
});

/** The proposal that speaks for the deal: the accepted one, else the newest. */
export const current = memberQuery({
  args: { dealId: v.id("deals") },
  handler: async (ctx, { dealId }) => {
    const rows = await versions(ctx, dealId);
    const proposal =
      rows.find((row) => row.status === "accepted") ?? rows[0] ?? null;
    if (!proposal) return null;
    const pricing = priceLines(
      proposal.lines,
      policyFor(proposal, await pricingPolicy(ctx)),
    );
    return {
      _id: proposal._id,
      version: proposal.version,
      status: proposal.status,
      approvalState: proposal.approval?.state ?? null,
      needsApproval: pricing.needsApproval,
      take: takeOf(pricing),
      marginRate: pricing.marginRate,
      lineCount: proposal.lines.length,
    };
  },
});

/** For the printable brand page; takes a raw id because it comes from the URL. */
export const get = memberQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("proposals", args.id);
    const proposal = id ? await ctx.db.get(id) : null;
    if (!proposal) return null;
    const deal = await ctx.db.get(proposal.dealId);
    if (!deal) return null;
    const account = await ctx.db.get(deal.accountId);
    const members = await memberIndex(ctx);
    const owner = members.get(deal.ownerId);
    return {
      ...proposal,
      policy: policyFor(proposal, await pricingPolicy(ctx)),
      payment: proposal.payment ?? DEFAULT_PAYMENT,
      deal: { _id: deal._id, title: deal.title },
      account: account ? { _id: account._id, name: account.name } : null,
      preparedBy: owner ? { name: owner.name, email: owner.email } : null,
    };
  },
});

function adminBase() {
  const url = process.env.PLATFORM_ADMIN_URL?.trim().replace(/\/+$/, "");
  return url && /^https?:\/\//.test(url) ? url : null;
}

/** For an accepted proposal: the approval payload for the platform admin and where to paste it. */
export const handoff = memberQuery({
  args: { id: v.id("proposals") },
  handler: async (ctx, { id }) => {
    const proposal = await ctx.db.get(id);
    if (!proposal || proposal.status !== "accepted") return null;
    const deal = await ctx.db.get(proposal.dealId);
    const account = deal ? await ctx.db.get(deal.accountId) : null;
    const orgId = account?.platformOrgId ?? null;
    const payload = approvalPayload(
      proposal.lines,
      proposal.payment ?? DEFAULT_PAYMENT,
      policyFor(proposal, await pricingPolicy(ctx)),
    );
    const base = adminBase();
    return {
      json: JSON.stringify(
        {
          crm_proposal: `v${proposal.version}`,
          organization: {
            platform_org_id: orgId,
            name: account?.name ?? null,
            ...payload.organization,
          },
          campaigns: payload.campaigns,
        },
        null,
        2,
      ),
      reviewUrl: base
        ? `${base}/campaigns${orgId ? `?organization_id=${encodeURIComponent(orgId)}` : ""}`
        : null,
      campaignUrlTemplate: base ? `${base}/campaigns/{campaign_id}` : null,
    };
  },
});

/** Starts a draft: a copy of the newest version, or a single blank line for a deal's first. */
export const create = memberMutation({
  args: {
    dealId: v.id("deals"),
    line: v.optional(vProposalLine),
    validUntil: v.optional(vDay),
  },
  handler: async (ctx, args) => {
    const deal = await requireDeal(ctx, args.dealId);
    const [latest] = await versions(ctx, deal._id);
    if (latest?.status === "draft") {
      fail("conflict", `Draft v${latest.version} is still open`);
    }
    const lines = latest
      ? latest.lines
      : args.line
        ? [cleanLine(args.line)]
        : [];
    const now = Date.now();
    const version = (latest?.version ?? 0) + 1;
    const id = await ctx.db.insert("proposals", {
      dealId: deal._id,
      version,
      status: "draft",
      currency: PROPOSAL_CURRENCY,
      lines,
      validUntil: cleanValidUntil(
        args.validUntil ?? istToday(DEFAULT_VALIDITY_DAYS),
      ),
      terms: latest?.terms ?? DEFAULT_TERMS,
      payment: latest?.payment ?? DEFAULT_PAYMENT,
      createdById: ctx.viewer._id,
      updatedAt: now,
    });
    await log(
      ctx,
      deal,
      latest
        ? `started proposal v${version} from v${latest.version}`
        : "started proposal v1",
    );
    return id;
  },
});

/** Draft settings. Returns the previous values so the client can offer undo. */
export const update = memberMutation({
  args: {
    id: v.id("proposals"),
    patch: v.object({
      validUntil: v.optional(vDay),
      terms: v.optional(v.string()),
      payment: v.optional(vPayment),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    const before = {
      validUntil: proposal.validUntil,
      terms: proposal.terms,
      payment: proposal.payment ?? DEFAULT_PAYMENT,
    };
    const next: Partial<Doc<"proposals">> = {};
    if (patch.validUntil !== undefined) {
      next.validUntil = cleanValidUntil(patch.validUntil);
    }
    if (patch.terms !== undefined) next.terms = cleanTerms(patch.terms);
    if (patch.payment !== undefined) next.payment = cleanPayment(patch.payment);
    await ctx.db.patch(id, { ...next, updatedAt: Date.now() });
    return before;
  },
});

/** Adds a line at `index` (default: the end); also restores a removed line. */
export const addLine = memberMutation({
  args: {
    id: v.id("proposals"),
    line: vProposalLine,
    index: v.optional(v.number()),
  },
  handler: async (ctx, { id, line, index }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    checkLineCount(proposal.lines.length + 1);
    if (!line.key || line.key.length > MAX_KEY_LENGTH) {
      invalid("key", "Invalid line key");
    }
    if (proposal.lines.some((item) => item.key === line.key)) {
      fail("conflict", "That line is already on the proposal");
    }
    const lines = [...proposal.lines];
    const at =
      index === undefined
        ? lines.length
        : Math.max(0, Math.min(lines.length, Math.trunc(index)));
    lines.splice(at, 0, cleanLine(line));
    await saveLines(ctx, proposal, lines);
  },
});

/** Returns the line as it was, for undo. */
export const updateLine = memberMutation({
  args: { id: v.id("proposals"), key: v.string(), patch: vLinePatch },
  handler: async (ctx, { id, key, patch }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    const index = findLine(proposal, key);
    const previous = proposal.lines[index];
    const lines = [...proposal.lines];
    lines[index] = applyLinePatch(previous, patch, await pricingPolicy(ctx));
    await saveLines(ctx, proposal, lines);
    return previous;
  },
});

/** Removes immediately; returns the line and its position so it can be put back. */
export const removeLine = memberMutation({
  args: { id: v.id("proposals"), key: v.string() },
  handler: async (ctx, { id, key }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    const index = findLine(proposal, key);
    const line = proposal.lines[index];
    await saveLines(
      ctx,
      proposal,
      proposal.lines.filter((item) => item.key !== key),
    );
    return { line, index };
  },
});

export const requestApproval = memberMutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, { id }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    const policy = await pricingPolicy(ctx);
    const pricing = priceLines(proposal.lines, policy);
    requireComplete(proposal.lines, pricing);
    if (!pricing.needsApproval) {
      fail("conflict", "This proposal is within policy; send it directly");
    }
    if (proposal.approval?.state === "requested") return;
    const deal = await requireDeal(ctx, proposal.dealId);
    await ctx.db.patch(id, {
      approval: {
        state: "requested",
        requestedById: ctx.viewer._id,
        requestedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
    const reasons = approvalReasons(pricing, policy).join(". ");
    await log(
      ctx,
      deal,
      `asked for approval of ${versionLabel(proposal)}`,
      reasons,
    );
    const managers = (await leadershipIds(ctx)).filter(
      (memberId) => memberId !== ctx.viewer._id,
    );
    await notifyMany(ctx, managers, {
      kind: "proposal_approval",
      title: `${ctx.viewer.name} needs approval on ${deal.title}`,
      body: `${reasons}. ${summaryLine(pricing)}`,
      href: `/deals/${deal._id}?tab=proposal`,
    });
  },
});

/** Managers and admins approve or decline pricing outside policy, always with a reason. */
export const decide = managerMutation({
  args: {
    id: v.id("proposals"),
    approve: v.boolean(),
    reason: v.string(),
  },
  handler: async (ctx, { id, approve, reason: input }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    if (!canDecideApproval(ctx.viewer, proposal.approval?.requestedById)) {
      fail(
        "forbidden",
        "Another manager or an admin has to decide on your own request",
      );
    }
    const reason = cleanReason(input, true);
    const pricing = priceLines(proposal.lines, await pricingPolicy(ctx));
    if (!pricing.needsApproval) {
      fail("conflict", "This proposal is within policy and needs no approval");
    }
    if (approve) requireComplete(proposal.lines, pricing);
    const deal = await requireDeal(ctx, proposal.dealId);
    const now = Date.now();
    await ctx.db.patch(id, {
      approval: {
        state: approve ? "approved" : "declined",
        requestedById: proposal.approval?.requestedById,
        requestedAt: proposal.approval?.requestedAt,
        decidedById: ctx.viewer._id,
        decidedAt: now,
        reason,
      },
      updatedAt: now,
    });
    const verb = approve ? "approved" : "declined";
    await log(
      ctx,
      deal,
      `${verb} the pricing on ${versionLabel(proposal)} at ${rateLabel(pricing.marginRate)} blended margin`,
      reason,
    );
    const requester = proposal.approval?.requestedById;
    if (requester && requester !== ctx.viewer._id) {
      await notify(ctx, requester, {
        kind: "proposal_approval",
        title: `${ctx.viewer.name} ${verb} the pricing on ${deal.title}`,
        body: reason,
        href: `/deals/${deal._id}?tab=proposal`,
      });
    }
  },
});

/** Freezes the version: default prices are written onto the lines and the policy is kept with it. */
export const send = memberMutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, { id }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    const policy = await pricingPolicy(ctx);
    const pricing = priceLines(proposal.lines, policy);
    requireComplete(proposal.lines, pricing);
    if (pricing.needsApproval && proposal.approval?.state !== "approved") {
      fail(
        "forbidden",
        "A manager has to approve this pricing before it goes to the brand",
      );
    }
    const deal = await requireDeal(ctx, proposal.dealId);
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "sent",
      lines: freezeLines(proposal.lines, policy),
      policy,
      payment: proposal.payment ?? DEFAULT_PAYMENT,
      sentAt: now,
      updatedAt: now,
    });
    await log(
      ctx,
      deal,
      `sent ${versionLabel(proposal)} to the brand`,
      summaryLine(pricing),
    );
  },
});

/**
 * The brand said yes: the deal's amount becomes this proposal's take.
 * Returns what it replaced so the client can undo.
 */
export const accept = memberMutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, { id }) => {
    const proposal = await requireProposal(ctx, id);
    requireMove(proposal, "accepted");
    const deal = await requireDeal(ctx, proposal.dealId);
    const accepted = (await versions(ctx, deal._id)).find(
      (row) => row.status === "accepted" && row._id !== proposal._id,
    );
    if (accepted) {
      fail(
        "conflict",
        `${versionLabel(accepted)} is already accepted; reopen it first`,
      );
    }
    const pricing = priceLines(
      proposal.lines,
      policyFor(proposal, await pricingPolicy(ctx)),
    );
    const take = takeOf(pricing);
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "accepted",
      decidedAt: now,
      updatedAt: now,
    });
    await log(
      ctx,
      deal,
      `marked ${versionLabel(proposal)} as accepted`,
      summaryLine(pricing),
    );
    const previousAmount = deal.amount;
    if (
      take.amount !== previousAmount.amount ||
      take.currency !== previousAmount.currency
    ) {
      await ctx.db.patch(deal._id, { amount: take, updatedAt: now });
      await logChanges(
        ctx,
        { accountId: deal.accountId, dealId: deal._id },
        ctx.viewer._id,
        [
          {
            field: "Amount",
            from: formatMoney(previousAmount),
            to: formatMoney(take),
          },
        ],
      );
    }
    return { previousAmount, amount: take };
  },
});

export const reject = memberMutation({
  args: { id: v.id("proposals"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason: input }) => {
    const proposal = await requireProposal(ctx, id);
    requireMove(proposal, "rejected");
    const reason = cleanReason(input, false);
    const deal = await requireDeal(ctx, proposal.dealId);
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "rejected",
      decidedAt: now,
      updatedAt: now,
    });
    await log(
      ctx,
      deal,
      `marked ${versionLabel(proposal)} as rejected`,
      reason,
    );
  },
});

/**
 * Undo for accept and reject: back to sent. Passing `amount` restores the deal
 * amount, but only while it still holds the take that accept wrote.
 */
export const reopen = memberMutation({
  args: {
    id: v.id("proposals"),
    restore: v.optional(
      v.object({
        previousAmount: vMoney,
        amount: vMoney,
      }),
    ),
  },
  handler: async (ctx, { id, restore }) => {
    const proposal = await requireProposal(ctx, id);
    if (proposal.status === "sent" || proposal.status === "draft") {
      fail("conflict", "This proposal is not decided");
    }
    requireMove(proposal, "sent");
    const deal = await requireDeal(ctx, proposal.dealId);
    const now = Date.now();
    await ctx.db.patch(id, {
      status: "sent",
      decidedAt: undefined,
      updatedAt: now,
    });
    await log(ctx, deal, `reopened ${versionLabel(proposal)}`);
    if (
      restore &&
      proposal.status === "accepted" &&
      deal.amount.amount === restore.amount.amount &&
      deal.amount.currency === restore.amount.currency
    ) {
      await ctx.db.patch(deal._id, {
        amount: assertMoney(restore.previousAmount, "amount"),
        updatedAt: now,
      });
      await logChanges(
        ctx,
        { accountId: deal.accountId, dealId: deal._id },
        ctx.viewer._id,
        [
          {
            field: "Amount",
            from: formatMoney(deal.amount),
            to: formatMoney(restore.previousAmount),
          },
        ],
      );
    }
  },
});

/** Deletes a draft immediately; the client keeps the copy to offer undo. */
export const remove = memberMutation({
  args: { id: v.id("proposals") },
  handler: async (ctx, { id }) => {
    const proposal = await requireProposal(ctx, id);
    requireDraft(proposal);
    const deal = await requireDeal(ctx, proposal.dealId);
    await ctx.db.delete(id);
    await log(ctx, deal, `deleted draft ${versionLabel(proposal)}`);
    const { _id, _creationTime, ...fields } = proposal;
    void _id;
    void _creationTime;
    return fields;
  },
});

export const restore = memberMutation({
  args: {
    proposal: v.object({
      dealId: v.id("deals"),
      version: v.number(),
      status: vProposalStatus,
      currency: vCurrency,
      lines: v.array(vProposalLine),
      validUntil: vDay,
      terms: v.string(),
      payment: v.optional(vPayment),
      policy: v.optional(vPolicy),
      approval: v.optional(vApproval),
      createdById: v.id("members"),
      sentAt: v.optional(v.number()),
      decidedAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  },
  handler: async (ctx, { proposal }) => {
    const deal = await requireDeal(ctx, proposal.dealId);
    if (proposal.status !== "draft")
      invalid("status", "Only drafts are restored");
    const rows = await versions(ctx, deal._id);
    if (rows.some((row) => row.status === "draft")) {
      fail("conflict", "Another draft is open");
    }
    if (rows.some((row) => row.version === proposal.version)) {
      fail("conflict", `v${proposal.version} already exists`);
    }
    checkLineCount(proposal.lines.length);
    // The copy comes from the client: only a decision this viewer could make survives.
    const approval =
      proposal.approval &&
      (proposal.approval.state === "requested" ||
        canDecideApproval(ctx.viewer, proposal.approval.requestedById))
        ? proposal.approval
        : undefined;
    const id = await ctx.db.insert("proposals", {
      ...proposal,
      approval,
      policy: undefined,
      sentAt: undefined,
      decidedAt: undefined,
      createdById: (await ctx.db.get(proposal.createdById))
        ? proposal.createdById
        : ctx.viewer._id,
      currency: PROPOSAL_CURRENCY,
      lines: proposal.lines.map(cleanLine),
      payment: cleanPayment(proposal.payment ?? DEFAULT_PAYMENT),
      validUntil: cleanValidUntil(proposal.validUntil),
      terms: cleanTerms(proposal.terms),
      updatedAt: Date.now(),
    });
    await log(ctx, deal, `restored draft ${versionLabel(proposal)}`);
    return id;
  },
});
