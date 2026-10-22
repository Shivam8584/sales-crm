import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import {
  REPORT_KINDS,
  buildReport,
  dueMonth,
  highlights,
  isQuiet,
  lastMonth,
  nextMonthly,
  periodAt,
  periodFor,
  recentPeriods,
  reportEmail,
  talkingPoints,
  type ReportKind,
  type ReportPeriod,
} from "../lib/domain/brand-report";
import { istToday } from "../lib/domain/day";
import { ACTIVATION_STEP_LABEL } from "../lib/domain/platform";
import { generate } from "./lib/ai";
import { brandPoints, type PointsOut } from "./lib/brandReportAi";
import { wrapData, todayLine } from "./lib/aiContext";
import {
  deliver as deliverMessage,
  emailProvider,
  unsubscribeLine,
} from "./lib/automations/delivery";
import { killSwitchOn } from "./lib/automations/safety";
import {
  contactDecision,
  loadSubject,
  recipientFor,
} from "./lib/automations/subject";
import { fail, invalid } from "./lib/errors";
import { internalMutation, memberMutation, memberQuery } from "./lib/functions";
import { assertCan, can } from "./lib/permissions";
import {
  latestSnapshot,
  platformMetrics,
  signupEvent,
  stateEvents,
} from "./lib/platform";
import { rateLimiter } from "./lib/rateLimiter";
import { requireAccount } from "./lib/records";
import { secretEnv } from "./lib/secrets";
import { literals } from "./lib/validators";

const ORG_EVENT_LIMIT = 5000;
const DISPATCH_BATCH = 200;
const STAGGER_MS = 2000;
const BODY_LOGGED = 2000;

const vKind = literals(REPORT_KINDS);

function periodOf(kind: ReportKind, key: string | undefined, now: number) {
  const period = key ? periodFor(kind, key) : periodAt(kind, now);
  if (!period) invalid("key", "That isn't a valid report period");
  return period;
}

async function loadReport(
  ctx: QueryCtx,
  account: Doc<"accounts">,
  period: ReportPeriod,
) {
  const orgId = account.platformOrgId;
  if (!orgId) return null;
  const now = Date.now();
  const rows = await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(ORG_EVENT_LIMIT);
  const created = rows.find(
    (event) => event.type === "organization.created" && event.processedAt,
  );
  const signup = created?.userId
    ? await signupEvent(ctx, created.userId)
    : null;
  const events = stateEvents(rows);
  const { steps } = platformMetrics(
    rows,
    account.stage,
    signup?.processedAt ? signup.occurredAt : null,
    now,
  );
  const snapshot = await latestSnapshot(ctx, account._id);
  return buildReport({
    period,
    events,
    snapshot: snapshot && {
      fetchedAt: snapshot.fetchedAt,
      balancePaise: snapshot.balancePaise,
      heldPaise: snapshot.heldPaise,
      staleReviews: snapshot.staleReviews,
      oldestReviewDays: snapshot.oldestReviewDays,
      disputes: snapshot.disputes,
      campaigns: snapshot.campaigns,
    },
    milestones: steps.map((step) => ({
      stage: step.stage,
      label: ACTIVATION_STEP_LABEL[step.stage],
      at: step.at,
    })),
    now,
  });
}

/** The results page: numbers for one period, plus the periods the picker offers. */
export const get = memberQuery({
  args: {
    accountId: v.id("accounts"),
    kind: vKind,
    key: v.optional(v.string()),
  },
  handler: async (ctx, { accountId, kind, key }) => {
    const account = await ctx.db.get(accountId);
    if (!account) return null;
    const now = Date.now();
    const period = periodOf(kind, key, now);
    const report = await loadReport(ctx, account, period);
    return {
      account: { _id: account._id, name: account.name },
      periods: recentPeriods(kind, now).map(({ key, label }) => ({
        key,
        label,
      })),
      period: { key: period.key, label: period.label },
      report,
      highlights: report ? highlights(report) : [],
      talkingPoints: report ? talkingPoints(report) : [],
    };
  },
});

async function monthlyRow(ctx: QueryCtx, accountId: Id<"accounts">) {
  return await ctx.db
    .query("brandReports")
    .withIndex("by_account", (q) => q.eq("accountId", accountId))
    .unique();
}

type Blocked = { ok: false; reason: string };

/** Who the email would go to and exactly what it would say, or why it can't go. */
async function compose(
  ctx: QueryCtx,
  account: Doc<"accounts">,
  period: ReportPeriod,
) {
  const report = await loadReport(ctx, account, period);
  if (!report) {
    return {
      ok: false,
      reason: "This account isn't linked to a Hypedrive organisation",
    } satisfies Blocked;
  }
  const subject = await loadSubject(ctx, { kind: "account", id: account._id });
  const recipient = subject ? await recipientFor(ctx, subject, "email") : null;
  const decision = await contactDecision(
    ctx,
    recipient,
    "email",
    "product_updates",
  );
  const owner = await ctx.db.get(account.ownerId);
  const email = reportEmail(report, {
    firstName: recipient?.firstName ?? "there",
    accountName: account.name,
    ownerFirstName: owner?.name.split(/\s+/)[0] ?? "The Hypedrive team",
  });
  return {
    ok: true as const,
    report,
    recipient,
    decision,
    email,
    ownerName: owner?.name,
  };
}

/** The "Email this report" panel: preview, recipient, consent and the monthly setting. */
export const emailPanel = memberQuery({
  args: { accountId: v.id("accounts"), key: v.optional(v.string()) },
  handler: async (ctx, { accountId, key }) => {
    const account = await requireAccount(ctx, accountId);
    const now = Date.now();
    const period = periodOf("month", key, now);
    const row = await monthlyRow(ctx, accountId);
    const composed = await compose(ctx, account, period);
    const provider = emailProvider();
    return {
      canSend: can(ctx.viewer, "report.send", [account.ownerId]),
      period: { key: period.key, label: period.label },
      provider: provider.provider,
      stopped: await killSwitchOn(ctx),
      blocked: composed.ok ? null : composed.reason,
      to: composed.ok && composed.recipient?.email ? composed.recipient : null,
      allowed: composed.ok ? composed.decision.allowed : false,
      consentNote: composed.ok ? composed.decision.message : null,
      email: composed.ok ? composed.email : null,
      monthly: {
        enabled: row?.enabled ?? false,
        last: row?.lastKey
          ? {
              key: row.lastKey,
              status: row.lastStatus ?? null,
              note: row.lastNote ?? null,
              at: row.lastSentAt ?? null,
            }
          : null,
        next: row?.enabled
          ? (() => {
              const next = nextMonthly(row.lastKey ?? lastMonth(now).key, now);
              return { label: next.period.label, day: next.day };
            })()
          : null,
      },
    };
  },
});

export const setMonthly = memberMutation({
  args: { accountId: v.id("accounts"), enabled: v.boolean() },
  handler: async (ctx, { accountId, enabled }) => {
    const account = await requireAccount(ctx, accountId);
    assertCan(ctx.viewer, "report.send", [account.ownerId]);
    if (enabled && !account.platformOrgId) {
      fail("conflict", "This account isn't linked to a Hypedrive organisation");
    }
    const row = await monthlyRow(ctx, accountId);
    if (row) {
      await ctx.db.patch(row._id, {
        enabled,
        enabledById: ctx.viewer._id,
        ...(enabled && !row.enabled
          ? { lastKey: lastMonth(Date.now()).key }
          : {}),
      });
    } else if (enabled) {
      await ctx.db.insert("brandReports", {
        accountId,
        enabled,
        enabledById: ctx.viewer._id,
        lastKey: lastMonth(Date.now()).key,
      });
    }
  },
});

/** Re-checks everything and hands the email to the delivery action. */
async function queue(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  key: string,
  options: { actorId?: Id<"members">; skipQuiet: boolean },
): Promise<Blocked | { ok: true }> {
  const account = await ctx.db.get(accountId);
  if (!account || account.archivedAt || account.mergedIntoId) {
    return { ok: false, reason: "The account is archived or merged" };
  }
  const period = periodFor("month", key);
  if (!period) return { ok: false, reason: "Not a valid month" };
  if (await killSwitchOn(ctx)) {
    return { ok: false, reason: "Automations are stopped for the workspace" };
  }
  const provider = emailProvider().provider;
  if (provider === "outbox") {
    return { ok: false, reason: "No email provider is set up" };
  }
  const composed = await compose(ctx, account, period);
  if (!composed.ok) return composed;
  if (!composed.decision.allowed || !composed.recipient?.personId) {
    return { ok: false, reason: composed.decision.message };
  }
  const to = composed.recipient.email;
  if (!to) return { ok: false, reason: "The contact has no email address" };
  if (options.skipQuiet && isQuiet(composed.report)) {
    return { ok: false, reason: `Nothing happened in ${period.label}` };
  }
  await ctx.scheduler.runAfter(0, internal.brandReport.deliver, {
    accountId,
    personId: composed.recipient.personId,
    key,
    to,
    subject: composed.email.subject,
    body: `${composed.email.body}\n\n${unsubscribeLine()}`,
    senderName: composed.ownerName,
    actorId: options.actorId,
  });
  return { ok: true };
}

export const sendNow = memberMutation({
  args: { accountId: v.id("accounts"), key: v.string() },
  handler: async (ctx, { accountId, key }) => {
    const account = await requireAccount(ctx, accountId);
    assertCan(ctx.viewer, "report.send", [account.ownerId]);
    const { ok } = await rateLimiter.limit(ctx, "brandReport", {
      key: ctx.viewer._id,
    });
    if (!ok) fail("rate_limited", "Too many report emails. Try again later.");
    const result = await queue(ctx, accountId, key, {
      actorId: ctx.viewer._id,
      skipQuiet: false,
    });
    if (!result.ok) fail("conflict", result.reason);
  },
});

/** Daily: queues last month's report for every opted-in account that hasn't had it. */
export const dispatch = internalMutation({
  args: {},
  handler: async (ctx) => {
    const key = dueMonth(Date.now());
    if (!key) return;
    const rows = await ctx.db
      .query("brandReports")
      .withIndex("by_enabled_key", (q) =>
        q.eq("enabled", true).lt("lastKey", key),
      )
      .take(DISPATCH_BATCH);
    let index = 0;
    for (const row of rows) {
      await ctx.scheduler.runAfter(
        index++ * STAGGER_MS,
        internal.brandReport.prepare,
        { accountId: row.accountId, key },
      );
    }
  },
});

export const prepare = internalMutation({
  args: { accountId: v.id("accounts"), key: v.string() },
  handler: async (ctx, { accountId, key }) => {
    const row = await monthlyRow(ctx, accountId);
    if (!row?.enabled || (row.lastKey ?? "") >= key) return;
    const result = await queue(ctx, accountId, key, { skipQuiet: true });
    await ctx.db.patch(
      row._id,
      result.ok
        ? { lastKey: key, lastStatus: undefined, lastNote: undefined }
        : {
            lastKey: key,
            lastStatus: "skipped",
            lastNote: result.reason,
            lastSentAt: undefined,
          },
    );
  },
});

export const deliver = internalAction({
  args: {
    accountId: v.id("accounts"),
    personId: v.id("people"),
    key: v.string(),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    senderName: v.optional(v.string()),
    actorId: v.optional(v.id("members")),
  },
  handler: async (ctx, args) => {
    const result = await deliverMessage(ctx, {
      channel: "email",
      provider: emailProvider().provider,
      stepKey: `report:${args.accountId}:${args.key}:${Date.now()}`,
      recipientId: args.personId,
      to: args.to,
      subject: args.subject,
      body: args.body,
      senderName: args.senderName,
    });
    await ctx.runMutation(internal.brandReport.settled, {
      accountId: args.accountId,
      personId: args.personId,
      key: args.key,
      subject: args.subject,
      body: args.body,
      actorId: args.actorId,
      error: result.ok ? undefined : result.error.slice(0, 300),
    });
  },
});

export const settled = internalMutation({
  args: {
    accountId: v.id("accounts"),
    personId: v.id("people"),
    key: v.string(),
    subject: v.string(),
    body: v.string(),
    actorId: v.optional(v.id("members")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const row = await monthlyRow(ctx, args.accountId);
    if (row && (row.lastKey ?? "") <= args.key) {
      await ctx.db.patch(row._id, {
        lastKey: args.key,
        lastStatus: args.error ? "failed" : "sent",
        lastNote: args.error,
        lastSentAt: args.error ? row.lastSentAt : now,
      });
    }
    if (args.error) return;
    // Marked automated so it never ends a sequence run that stops on a teammate's email.
    await ctx.db.insert("timeline", {
      kind: "email",
      accountId: args.accountId,
      personId: args.personId,
      actorId: args.actorId,
      occurredAt: now,
      automated: true,
      direction: "outbound",
      subject: args.subject,
      body: args.body.slice(0, BODY_LOGGED),
    });
  },
});

/** Talking points for a quarterly review, written from the report's own numbers. */
export const draftPoints = action({
  args: { accountId: v.id("accounts"), key: v.string() },
  handler: async (ctx, { accountId, key }): Promise<string[]> => {
    if (!(await ctx.runQuery(api.ai.enabled, {}))) {
      fail("unavailable", "AI is not set up on this server");
    }
    const data = await ctx.runQuery(api.brandReport.get, {
      accountId,
      kind: "quarter",
      key,
    });
    if (!data?.report) {
      fail("conflict", "This account isn't linked to a Hypedrive organisation");
    }
    await ctx.runMutation(internal.ai.consume, {});
    const context = {
      account: data.account.name,
      period: data.period.label,
      highlights: data.highlights,
      campaigns: data.report.campaigns.rows.map((row) => ({
        title: row.title,
        status: row.statusLabel,
        approvedResults: row.approved,
      })),
      suggested: data.talkingPoints,
    };
    const out = await generate<PointsOut>(
      {
        model: "main",
        system: brandPoints.system,
        input: `Today is ${todayLine(istToday())}.\n${wrapData(context)}`,
        schema: brandPoints.schema,
        maxOutputTokens: 1000,
      },
      fetch,
      await secretEnv(ctx),
    );
    const points = out.points.map((point) => point.trim()).filter(Boolean);
    if (!points.length) {
      fail("unavailable", "AI gave an answer we couldn't use. Try again.");
    }
    return points.slice(0, 6);
  },
});
