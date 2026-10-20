import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { LifecycleStage, Priority } from "../../lib/domain/enums";
import {
  ACTIVATION_STAGES,
  EVENT_STAGE,
  PLATFORM_EVENT_LABEL,
  type PlatformEventType,
} from "../../lib/domain/platform";
import { STAGE_LABEL } from "../../lib/domain/labels";
import { signupEvent } from "./platform";
import { endPosition, taskRefs, upsertAutomatedTask } from "./tasks";
import { logSystem } from "./timeline";

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** How long a brand may sit at each step before a rep gets a task. */
export const STALL_THRESHOLDS = {
  signup_no_org: 24 * HOUR,
  org_no_gst: 24 * HOUR,
  gst_failed: 0,
  verified_no_topup: 72 * HOUR,
  funded_no_campaign: 3 * DAY,
  review_pending: 48 * HOUR,
  live_no_result: 7 * DAY,
} as const;

export type StallRuleId = keyof typeof STALL_THRESHOLDS;
export type ActivationStage = (typeof ACTIVATION_STAGES)[number];

export type TimelineEvent = { type: string; occurredAt: number };
export type StallAccount = {
  name: string;
  stage: LifecycleStage;
  /** Fallback clock when the platform events for a step are missing. */
  createdAt: number;
};

export type Journey = {
  stage: ActivationStage | null;
  /** When the brand reached its current stage. */
  stageAt: number;
  events: TimelineEvent[];
  lastEventAt: number | null;
};

export type StallRule = {
  id: StallRuleId;
  label: string;
  description: string;
  playbook: string;
  priority: Priority;
  /** Stall start, or null when the rule doesn't apply. */
  detect: (
    account: StallAccount,
    events: TimelineEvent[],
    now: number,
  ) => number | null;
  title: (name: string, since: number, now: number) => string;
};

const BEYOND_ACTIVATION: LifecycleStage[] = ["expanding"];

function stageIndex(type: string) {
  const stage = EVENT_STAGE[type as PlatformEventType];
  return stage ? ACTIVATION_STAGES.indexOf(stage as ActivationStage) : -1;
}

/**
 * Where the brand is on the activation path. Platform events are the source of
 * truth; the account stage only counts when it's further along, e.g. set by hand.
 */
export function journey(
  account: StallAccount,
  events: TimelineEvent[],
): Journey {
  const sorted = [...events].sort((a, b) => a.occurredAt - b.occurredAt);
  let index = -1;
  for (const event of sorted) index = Math.max(index, stageIndex(event.type));
  const fromAccount = BEYOND_ACTIVATION.includes(account.stage)
    ? ACTIVATION_STAGES.length - 1
    : ACTIVATION_STAGES.indexOf(account.stage as ActivationStage);
  const reached = Math.max(index, fromAccount);
  const lastEventAt = sorted[sorted.length - 1]?.occurredAt ?? null;
  if (reached === -1) {
    return {
      stage: null,
      stageAt: account.createdAt,
      events: sorted,
      lastEventAt,
    };
  }
  const entered = sorted.find((event) => stageIndex(event.type) === reached);
  return {
    stage: ACTIVATION_STAGES[reached],
    stageAt: entered?.occurredAt ?? lastEventAt ?? account.createdAt,
    events: sorted,
    lastEventAt,
  };
}

/** "26 hours", "4 days". */
export function span(ms: number) {
  const hours = Math.max(1, Math.floor(ms / HOUR));
  if (hours < 48) return hours === 1 ? "1 hour" : `${hours} hours`;
  return `${Math.floor(ms / DAY)} days`;
}

const ago = (since: number, now: number) => `${span(now - since)} ago`;

function atStage(
  stage: ActivationStage,
  threshold: number,
  extra?: (journey: Journey) => number | null | false,
): StallRule["detect"] {
  return (account, events, now) => {
    const current = journey(account, events);
    if (current.stage !== stage) return null;
    const since = extra ? extra(current) : current.stageAt;
    if (since === null || since === false) return null;
    return now - since >= threshold ? since : null;
  };
}

const lastGst = (current: Journey) =>
  current.events
    .filter((event) => event.type.startsWith("organization.gst_"))
    .pop();

const firstSubmitted = (current: Journey) =>
  current.events.find((event) => event.type === "campaign.submitted");

export const STALL_RULES: StallRule[] = [
  {
    id: "signup_no_org",
    label: "No organisation",
    description: "Signed up but hasn't created an organisation",
    playbook:
      "Call, then follow up on WhatsApp. Offer to fill in the onboarding form with them on the call: brand name, website, support phone and GSTIN.",
    priority: "high",
    detect: atStage("signed_up", STALL_THRESHOLDS.signup_no_org),
    title: (name, since, now) =>
      `Help ${name} create their organisation — signed up ${ago(since, now)}`,
  },
  {
    id: "org_no_gst",
    label: "GST not verified",
    description: "Created an organisation but hasn't verified GST",
    playbook:
      "Ask for the GSTIN and check it on the GST portal together. If they don't have one yet, note it on the account; there's no onboarding path without GST.",
    priority: "high",
    detect: atStage(
      "org_created",
      STALL_THRESHOLDS.org_no_gst,
      (current) => !lastGst(current) && current.stageAt,
    ),
    title: (name, since, now) =>
      `Get ${name} to verify GST — organisation created ${ago(since, now)}`,
  },
  {
    id: "gst_failed",
    label: "GST failed",
    description: "Their latest GST verification failed",
    playbook:
      "Call to find out why: a typo, a cancelled or suspended GSTIN, or a legal name mismatch. Walk them through retrying, or refer them to a CA partner if registration needs fixing.",
    priority: "high",
    detect: atStage("org_created", STALL_THRESHOLDS.gst_failed, (current) => {
      const gst = lastGst(current);
      return gst?.type === "organization.gst_failed" && gst.occurredAt;
    }),
    title: (name, since, now) =>
      `Fix ${name}'s GST verification — failed ${ago(since, now)}`,
  },
  {
    id: "verified_no_topup",
    label: "Not funded",
    description: "GST verified but hasn't topped up their wallet",
    playbook:
      "Send a UPI top-up link on WhatsApp and remind them the minimum is ₹100. Share their virtual account details for bank transfers and recap the expected return on a first campaign.",
    priority: "urgent",
    detect: atStage("gst_verified", STALL_THRESHOLDS.verified_no_topup),
    title: (name, since, now) =>
      `Get ${name} to top up — GST verified ${ago(since, now)}`,
  },
  {
    id: "funded_no_campaign",
    label: "No campaign",
    description: "Funded but hasn't submitted a campaign",
    playbook:
      "Offer assisted setup: add their first listing from the marketplace link, pick a slot count that fits the balance, and submit the campaign together on a call.",
    priority: "high",
    detect: atStage(
      "funded",
      STALL_THRESHOLDS.funded_no_campaign,
      (current) => !firstSubmitted(current) && current.stageAt,
    ),
    title: (name, since, now) =>
      `Get ${name} to submit a campaign — funded ${ago(since, now)}`,
  },
  {
    id: "review_pending",
    label: "Stuck in review",
    description: "Campaign submitted but not live yet",
    playbook:
      "Internal SLA: escalate to ops to finish pricing review. If changes were requested, call the brand with the fixes, then let them know when it goes live.",
    priority: "high",
    detect: atStage(
      "funded",
      STALL_THRESHOLDS.review_pending,
      (current) => firstSubmitted(current)?.occurredAt ?? null,
    ),
    title: (name, since, now) =>
      `Get ${name}'s campaign live — in review for ${span(now - since)}`,
  },
  {
    id: "live_no_result",
    label: "No results",
    description: "Live but no creator result approved yet",
    playbook:
      "Check slot fill and pending enrollments. If slots aren't filling, suggest a higher bonus or price; if results are waiting, nudge the brand to review them.",
    priority: "normal",
    detect: atStage("live", STALL_THRESHOLDS.live_no_result),
    title: (name, since, now) =>
      `Get ${name} their first approved result — live ${ago(since, now)}`,
  },
];

export const STALL_RULE = Object.fromEntries(
  STALL_RULES.map((rule) => [rule.id, rule]),
) as Record<StallRuleId, StallRule>;

export type Stall = { rule: StallRule; since: number };

/** The step the brand is stuck on, if any. Rules are mutually exclusive by stage. */
export function detectStall(
  account: StallAccount,
  events: TimelineEvent[],
  now: number,
): Stall | null {
  for (const rule of STALL_RULES) {
    const since = rule.detect(account, events, now);
    if (since !== null) return { rule, since };
  }
  return null;
}

export const automationKey = (ruleId: StallRuleId, accountId: Id<"accounts">) =>
  `activation:${ruleId}:${accountId}`;

const KEY_PREFIX = "activation:";

/** Accounts on the platform: linked to an org, or signed up before creating one. */
export async function platformAccounts(ctx: QueryCtx) {
  const linked = await ctx.db
    .query("accounts")
    .withIndex("by_platform_org", (q) => q.gt("platformOrgId", ""))
    .collect();
  const signedUp = await ctx.db
    .query("accounts")
    .withIndex("by_stage", (q) => q.eq("stage", "signed_up"))
    .collect();
  const seen = new Set<Id<"accounts">>();
  return [...linked, ...signedUp].filter((account) => {
    if (account.archivedAt || seen.has(account._id)) return false;
    seen.add(account._id);
    return true;
  });
}

/** Processed platform events for the account's org, plus its people's signups before an org exists. */
export async function accountEvents(
  ctx: QueryCtx,
  account: Doc<"accounts">,
): Promise<TimelineEvent[]> {
  const orgId = account.platformOrgId;
  const rows: Doc<"platformEvents">[] = [];
  if (orgId) {
    rows.push(
      ...(await ctx.db
        .query("platformEvents")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .collect()),
    );
  } else {
    const people = await ctx.db
      .query("people")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .collect();
    for (const person of people) {
      if (!person.platformUserId) continue;
      const signup = await signupEvent(ctx, person.platformUserId);
      if (signup) rows.push(signup);
    }
  }
  return rows
    .filter((row) => row.processedAt)
    .map((row) => ({ type: row.type, occurredAt: row.occurredAt }));
}

export function stallAccount(account: Doc<"accounts">): StallAccount {
  return {
    name: account.name,
    stage: account.stage,
    createdAt: account._creationTime,
  };
}

/** Today in India, where the team works, as `YYYY-MM-DD`. */
export function indiaDay(now: number) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    now,
  );
}

/** Marks an automated task done on the brand's behalf and says why on the timeline. */
export async function closeAutomatedTask(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  reason: string,
) {
  const now = Date.now();
  await ctx.db.patch(task._id, {
    status: "done",
    completedAt: now,
    position: await endPosition(ctx, "done"),
    updatedAt: now,
  });
  await logSystem(
    ctx,
    taskRefs(task),
    `closed the task “${task.title}” — ${reason}`,
  );
}

async function fallbackAssignee(ctx: QueryCtx) {
  const members = await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  return (members.find((member) => member.role === "admin") ?? members[0])?._id;
}

export type CheckChange = {
  outcome: "created" | "reopened" | "closed";
  taskId: Id<"tasks">;
  accountId: Id<"accounts"> | null;
  accountName: string;
  rule: string;
  detail: string;
};

export type CheckResult = {
  checked: number;
  stuck: number;
  changes: CheckChange[];
};

function clearReason(account: Doc<"accounts"> | null, events: TimelineEvent[]) {
  if (!account || account.archivedAt) return "the account was archived";
  if (!account.platformOrgId && account.stage !== "signed_up") {
    return `${account.name} is no longer linked to Hypedrive`;
  }
  const current = journey(stallAccount(account), events);
  const entered = events.some(
    (event) => EVENT_STAGE[event.type as PlatformEventType] === current.stage,
  );
  if (current.stage && !entered) {
    return `${account.name} moved to ${STAGE_LABEL[current.stage]}`;
  }
  const latest = current.events[current.events.length - 1];
  const label =
    latest && PLATFORM_EVENT_LABEL[latest.type as PlatformEventType];
  return label
    ? `${account.name} ${label}`
    : `${account.name} is no longer stuck`;
}

/**
 * Opens a task for every stalled brand and closes the ones whose brand moved on.
 * Safe to run any number of times: tasks are keyed by rule and account.
 */
export async function runActivationChecks(
  ctx: MutationCtx,
  now: number,
): Promise<CheckResult> {
  const accounts = await platformAccounts(ctx);
  const eventsByAccount = new Map<Id<"accounts">, TimelineEvent[]>();
  const active = new Set<string>();
  const changes: CheckChange[] = [];
  const dueDate = indiaDay(now);
  let fallback: Id<"members"> | undefined | null = null;

  for (const account of accounts) {
    const events = await accountEvents(ctx, account);
    eventsByAccount.set(account._id, events);
    const stall = detectStall(stallAccount(account), events, now);
    if (!stall) continue;
    const key = automationKey(stall.rule.id, account._id);
    active.add(key);

    let assigneeId: Id<"members"> | undefined = account.ownerId;
    const owner = await ctx.db.get(account.ownerId);
    if (owner?.status !== "active") {
      if (fallback === null) fallback = await fallbackAssignee(ctx);
      assigneeId = fallback;
    }
    if (!assigneeId) continue;

    const title = stall.rule.title(account.name, stall.since, now);
    const result = await upsertAutomatedTask(ctx, {
      automationKey: key,
      title,
      notes: stall.rule.playbook,
      priority: stall.rule.priority,
      assigneeId,
      dueDate,
      accountId: account._id,
    });
    if (result.outcome !== "unchanged") {
      changes.push({
        outcome: result.outcome,
        taskId: result.id,
        accountId: account._id,
        accountName: account.name,
        rule: stall.rule.label,
        detail: title,
      });
    }
  }

  for (const task of await openActivationTasks(ctx)) {
    if (active.has(task.automationKey!)) continue;
    const account = task.accountId ? await ctx.db.get(task.accountId) : null;
    const events = account
      ? (eventsByAccount.get(account._id) ??
        (await accountEvents(ctx, account)))
      : [];
    const reason = clearReason(account, events);
    await closeAutomatedTask(ctx, task, reason);
    const ruleId = task.automationKey!.split(":")[1] as StallRuleId;
    changes.push({
      outcome: "closed",
      taskId: task._id,
      accountId: account?._id ?? null,
      accountName: account?.name ?? "Deleted account",
      rule: STALL_RULE[ruleId]?.label ?? "Activation",
      detail: reason,
    });
  }

  return { checked: accounts.length, stuck: active.size, changes };
}

async function openActivationTasks(ctx: QueryCtx) {
  const open: Doc<"tasks">[] = [];
  for (const status of ["todo", "in_progress"] as const) {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status_position", (q) => q.eq("status", status))
      .collect();
    open.push(
      ...tasks.filter((task) => task.automationKey?.startsWith(KEY_PREFIX)),
    );
  }
  return open;
}
