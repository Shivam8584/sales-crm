import type { MutationCtx, QueryCtx } from "../_generated/server";
import { istDay } from "../../lib/domain/day";
import type { Doc, Id } from "../_generated/dataModel";
import type { LifecycleStage, Priority } from "../../lib/domain/enums";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
  PLATFORM_EVENT_LABEL,
  eventStage,
  pathIndex,
  type ActivationStage,
  type PlatformEventType,
} from "../../lib/domain/platform";
import {
  fundsPaused,
  isOpenCampaign,
  liveCampaigns,
  platformState,
  type PlatformState,
  type StateEvent,
} from "../../lib/domain/platform-state";
import { gstFailures, signupEvent, stateEvents } from "./platform";
import { emitAutomationTrigger } from "./automations/engine";
import { endPosition, taskRefs, upsertAutomatedTask } from "./tasks";
import { logSystem } from "./timeline";

export type { ActivationStage };

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

/** How long a brand may sit in each situation before a rep gets a task. */
export const STALL_THRESHOLDS = {
  gst_failed: 0,
  signup_no_org: 24 * HOUR,
  paused_no_funds: 0,
  low_balance: 0,
  review_escalation: 14 * DAY,
  review_backlog: 3 * DAY,
  changes_requested: 48 * HOUR,
  verified_no_topup: 72 * HOUR,
  funded_no_campaign: 3 * DAY,
  review_pending: 48 * HOUR,
  live_no_result: 7 * DAY,
  renewal_due: 7 * DAY,
} as const;

export type StallRuleId = keyof typeof STALL_THRESHOLDS;

export type TimelineEvent = StateEvent;
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

/** Everything a rule can look at. */
export type StallInput = {
  account: StallAccount;
  journey: Journey;
  state: PlatformState;
  now: number;
};

export type StallRule = {
  id: StallRuleId;
  label: string;
  description: string;
  playbook: string;
  priority: Priority;
  /** Stall start, or null when the rule doesn't apply. */
  detect: (input: StallInput) => number | null;
  title: (
    name: string,
    since: number,
    now: number,
    input: StallInput,
  ) => string;
};

const stageIndex = (event: TimelineEvent) =>
  pathIndex(eventStage(event.type, event.data));

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
  for (const event of sorted) index = Math.max(index, stageIndex(event));
  const fromAccount =
    account.stage === "expanding"
      ? ACTIVATION_STAGES.length - 1
      : pathIndex(account.stage);
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
  const entered = sorted.find((event) => stageIndex(event) === reached);
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

function past(
  threshold: number,
  since: number | null | undefined,
  now: number,
): number | null {
  if (since === null || since === undefined) return null;
  return now - since >= threshold ? since : null;
}

const atStage = (input: StallInput, stage: ActivationStage) =>
  input.journey.stage === stage;

const earliest = (values: number[]) =>
  values.length ? Math.min(...values) : null;

const worstReview = (input: StallInput) =>
  [...input.state.reviews].sort((a, b) => a.oldestAt - b.oldestAt)[0];

/** Funding that arrived after the campaign was paused, which the platform doesn't act on. */
const toppedUpSince = (input: StallInput, since: number) =>
  input.state.funding.at.some((at) => at > since);

export const STALL_RULES: StallRule[] = [
  {
    id: "paused_no_funds",
    label: "Paused: no funds",
    description: "A campaign was paused automatically for insufficient funds",
    playbook:
      "Call now: they need to top up AND resume the campaign by hand, because nothing resumes it after a top-up. Send the UPI link or virtual account details, then stay on the line while they press Resume.",
    priority: "urgent",
    detect: (input) =>
      past(
        STALL_THRESHOLDS.paused_no_funds,
        earliest(fundsPaused(input.state).map((campaign) => campaign.since)),
        input.now,
      ),
    title: (name, since, now, input) =>
      toppedUpSince(input, since)
        ? `Get ${name} to resume their paused campaign — topped up but still paused ${span(now - since)}`
        : `Rescue ${name}: top up and resume — campaign paused for funds ${ago(since, now)}`,
  },
  {
    id: "gst_failed",
    label: "GST failed",
    description: "GST verification failed at signup, so no organisation yet",
    playbook:
      "Call to find out why: a typo, a cancelled or suspended GSTIN, or a legal name that doesn't match. Walk them through retrying; refer them to a CA partner if the registration itself needs fixing. There's no onboarding without GST.",
    priority: "high",
    detect: (input) =>
      input.journey.stage === "signed_up" || input.journey.stage === null
        ? past(STALL_THRESHOLDS.gst_failed, input.state.gstFailedAt, input.now)
        : null,
    title: (name, since, now) =>
      `Fix ${name}'s GST so they can create their organisation — failed ${ago(since, now)}`,
  },
  {
    id: "signup_no_org",
    label: "No organisation",
    description: "Signed up but hasn't created an organisation",
    playbook:
      "Call, then follow up on WhatsApp. Offer to fill in the onboarding form with them on the call: brand name, website, support phone and GSTIN.",
    priority: "high",
    detect: (input) =>
      atStage(input, "signed_up")
        ? past(STALL_THRESHOLDS.signup_no_org, input.journey.stageAt, input.now)
        : null,
    title: (name, since, now) =>
      `Help ${name} create their organisation — signed up ${ago(since, now)}`,
  },
  {
    id: "low_balance",
    label: "Low balance",
    description: "Wallet is low or negative while campaigns are live",
    playbook:
      "Ask for a top-up before campaigns pause: share the UPI link and their virtual account for bank transfers. A negative wallet blocks submitting and resuming campaigns.",
    priority: "high",
    detect: (input) =>
      input.state.wallet.status !== "ok" &&
      liveCampaigns(input.state).length > 0
        ? past(
            STALL_THRESHOLDS.low_balance,
            input.state.wallet.since,
            input.now,
          )
        : null,
    title: (name, since, now, input) =>
      input.state.wallet.status === "negative"
        ? `Get ${name} out of a negative balance — live campaigns at risk since ${ago(since, now)}`
        : `Get ${name} to top up — balance low with campaigns live, ${ago(since, now)}`,
  },
  {
    id: "review_escalation",
    label: "Reviews stuck 14d+",
    description: "Creator results have waited 14 days or more for the brand",
    playbook:
      "Escalate: call the brand owner and agree a review slot today. Creators are waiting to be paid and the platform's own reminders haven't worked; loop in ops if results need an admin decision.",
    priority: "urgent",
    detect: (input) => {
      const review = worstReview(input);
      return review
        ? past(STALL_THRESHOLDS.review_escalation, review.oldestAt, input.now)
        : null;
    },
    title: (name, since, now, input) =>
      `Escalate ${name}'s review backlog — ${worstReview(input)?.count ?? "results"} waiting, oldest ${span(now - since)}`,
  },
  {
    id: "review_backlog",
    label: "Review backlog",
    description: "Creator results have waited 3+ days for the brand's review",
    playbook:
      "Nudge the brand on WhatsApp with the count waiting, and offer a 10-minute call to review together. Slow reviews put creators off the next campaign.",
    priority: "high",
    detect: (input) => {
      const review = worstReview(input);
      return review
        ? past(STALL_THRESHOLDS.review_backlog, review.oldestAt, input.now)
        : null;
    },
    title: (name, since, now, input) =>
      `Get ${name} to review creator results — ${worstReview(input)?.count ?? "some"} waiting, oldest ${span(now - since)}`,
  },
  {
    id: "changes_requested",
    label: "Not resubmitted",
    description:
      "Review asked for changes 48+ hours ago and they haven't resubmitted",
    playbook:
      "Call with the reviewer's action items in hand and fix the campaign together, then resubmit on the call.",
    priority: "high",
    detect: (input) =>
      past(
        STALL_THRESHOLDS.changes_requested,
        earliest(
          input.state.campaigns
            .filter((campaign) => campaign.status === "changes_requested")
            .map((campaign) => campaign.since),
        ),
        input.now,
      ),
    title: (name, since, now) =>
      `Help ${name} resubmit their campaign — changes requested ${ago(since, now)}`,
  },
  {
    id: "verified_no_topup",
    label: "Not funded",
    description:
      "Organisation created (GST verified) but the wallet isn't funded",
    playbook:
      "Send a UPI top-up link on WhatsApp, or share their virtual account for a bank transfer. Recap the expected return on a first campaign.",
    priority: "urgent",
    detect: (input) =>
      atStage(input, "org_created")
        ? past(
            STALL_THRESHOLDS.verified_no_topup,
            input.journey.stageAt,
            input.now,
          )
        : null,
    title: (name, since, now) =>
      `Get ${name} to fund their wallet — organisation created ${ago(since, now)}`,
  },
  {
    id: "funded_no_campaign",
    label: "No campaign",
    description: "Funded but hasn't submitted a campaign",
    playbook:
      "Offer assisted setup: add their first listing from the marketplace link, pick a slot count that fits the balance, and submit the campaign together on a call.",
    priority: "high",
    detect: (input) =>
      atStage(input, "funded") && input.state.campaigns.length === 0
        ? past(
            STALL_THRESHOLDS.funded_no_campaign,
            input.journey.stageAt,
            input.now,
          )
        : null,
    title: (name, since, now) =>
      `Get ${name} to submit a campaign — funded ${ago(since, now)}`,
  },
  {
    id: "review_pending",
    label: "Stuck in review",
    description: "First campaign submitted but not approved yet",
    playbook:
      "Internal SLA: escalate to ops to finish the pricing review, then tell the brand when it's approved.",
    priority: "high",
    detect: (input) =>
      atStage(input, "funded")
        ? past(
            STALL_THRESHOLDS.review_pending,
            earliest(
              input.state.campaigns
                .filter((campaign) => campaign.status === "pending_review")
                .map((campaign) => campaign.since),
            ),
            input.now,
          )
        : null,
    title: (name, since, now) =>
      `Get ${name}'s campaign approved — in review for ${span(now - since)}`,
  },
  {
    id: "live_no_result",
    label: "No results",
    description: "Live but no creator result approved yet",
    playbook:
      "Check slot fill and pending enrollments. If slots aren't filling, suggest a higher bonus or price; if results are waiting, nudge the brand to review them.",
    priority: "normal",
    detect: (input) =>
      atStage(input, "live")
        ? past(
            STALL_THRESHOLDS.live_no_result,
            input.journey.stageAt,
            input.now,
          )
        : null,
    title: (name, since, now) =>
      `Get ${name} their first approved result — live ${ago(since, now)}`,
  },
  {
    id: "renewal_due",
    label: "Renewal due",
    description: "Every campaign has ended and nothing new in 7 days",
    playbook:
      "Share the results of the last campaign, then pitch the next one: new SKUs, another marketplace, or more slots on what sold out.",
    priority: "normal",
    detect: (input) => {
      const { campaigns } = input.state;
      if (campaigns.length === 0 || campaigns.some(isOpenCampaign)) return null;
      const ended = campaigns.flatMap((campaign) =>
        campaign.status === "ended" && campaign.endedAt
          ? [campaign.endedAt]
          : [],
      );
      return past(
        STALL_THRESHOLDS.renewal_due,
        ended.length ? Math.max(...ended) : null,
        input.now,
      );
    },
    title: (name, since, now) =>
      `Pitch ${name}'s next campaign — last one ended ${ago(since, now)}`,
  },
];

export const STALL_RULE = Object.fromEntries(
  STALL_RULES.map((rule) => [rule.id, rule]),
) as Record<StallRuleId, StallRule>;

export type Stall = { rule: StallRule; since: number; title: string };

export function stallInput(
  account: StallAccount,
  events: TimelineEvent[],
  now: number,
): StallInput {
  return {
    account,
    journey: journey(account, events),
    state: platformState(events, now),
    now,
  };
}

/** The most pressing thing the brand is stuck on; rules are ordered by urgency. */
export function detectStall(
  account: StallAccount,
  events: TimelineEvent[],
  now: number,
): Stall | null {
  const input = stallInput(account, events, now);
  for (const rule of STALL_RULES) {
    const since = rule.detect(input);
    if (since !== null) {
      return {
        rule,
        since,
        title: rule.title(account.name, since, now, input),
      };
    }
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

/** Processed platform events for the account's org, plus its people's signups and GST failures before an org exists. */
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
      rows.push(...(await gstFailures(ctx, person.platformUserId)));
    }
  }
  return stateEvents(rows);
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
  return istDay(now);
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

/** Linked to an org, or signed up before creating one. */
export function isOnPlatform(account: Doc<"accounts">) {
  return (
    !account.archivedAt &&
    (Boolean(account.platformOrgId) || account.stage === "signed_up")
  );
}

export type AccountStall = Stall & { stage: ActivationStage };

/** The step this account is stuck on right now, if any. */
export async function accountStall(
  ctx: QueryCtx,
  account: Doc<"accounts">,
  now: number,
  events?: TimelineEvent[],
): Promise<AccountStall | null> {
  if (!isOnPlatform(account)) return null;
  const list = events ?? (await accountEvents(ctx, account));
  const input = stallAccount(account);
  const stall = detectStall(input, list, now);
  const stage = journey(input, list).stage ?? "signed_up";
  return stall ? { ...stall, stage } : null;
}

function clearReason(account: Doc<"accounts"> | null, events: TimelineEvent[]) {
  if (!account || account.archivedAt) return "the account was archived";
  if (!account.platformOrgId && account.stage !== "signed_up") {
    return `${account.name} is no longer linked to Hypedrive`;
  }
  const current = journey(stallAccount(account), events);
  const entered = events.some(
    (event) => eventStage(event.type, event.data) === current.stage,
  );
  if (current.stage && !entered) {
    return `${account.name} moved to ${ACTIVATION_STEP_LABEL[current.stage]}`;
  }
  const latest = current.events[current.events.length - 1];
  const label =
    latest && PLATFORM_EVENT_LABEL[latest.type as PlatformEventType];
  return label
    ? `${account.name} ${label}`
    : `${account.name} is no longer stuck`;
}

const isOpenActivationTask = (task: Doc<"tasks">) =>
  task.status !== "done" && Boolean(task.automationKey?.startsWith(KEY_PREFIX));

type Assignees = { fallback: Id<"members"> | undefined | null };

/**
 * Opens the task for the account's current stall and closes its activation
 * tasks for any other rule. Returns what changed.
 */
async function syncAccount(
  ctx: MutationCtx,
  account: Doc<"accounts">,
  events: TimelineEvent[],
  now: number,
  assignees: Assignees,
) {
  const changes: CheckChange[] = [];
  const stall = await accountStall(ctx, account, now, events);
  const key = stall ? automationKey(stall.rule.id, account._id) : null;

  if (stall && key) {
    let assigneeId: Id<"members"> | undefined = account.ownerId;
    const owner = await ctx.db.get(account.ownerId);
    if (owner?.status !== "active") {
      if (assignees.fallback === null) {
        assignees.fallback = await fallbackAssignee(ctx);
      }
      assigneeId = assignees.fallback;
    }
    if (assigneeId) {
      const result = await upsertAutomatedTask(ctx, {
        automationKey: key,
        title: stall.title,
        notes: stall.rule.playbook,
        priority: stall.rule.priority,
        assigneeId,
        dueDate: indiaDay(now),
        accountId: account._id,
      });
      if (result.outcome !== "unchanged") {
        await emitAutomationTrigger(ctx, {
          kind: "stall_started",
          refs: { accountId: account._id },
          value: stall.rule.id,
        });
        changes.push({
          outcome: result.outcome,
          taskId: result.id,
          accountId: account._id,
          accountName: account.name,
          rule: stall.rule.label,
          detail: stall.title,
        });
      }
    }
  }

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_account", (q) => q.eq("accountId", account._id))
    .collect();
  for (const task of tasks) {
    if (!isOpenActivationTask(task) || task.automationKey === key) continue;
    changes.push(await closeStale(ctx, task, account, events));
  }
  return { key, changes };
}

async function closeStale(
  ctx: MutationCtx,
  task: Doc<"tasks">,
  account: Doc<"accounts"> | null,
  events: TimelineEvent[],
): Promise<CheckChange> {
  const reason = clearReason(account, events);
  await closeAutomatedTask(ctx, task, reason);
  const ruleId = task.automationKey!.split(":")[1] as StallRuleId;
  return {
    outcome: "closed",
    taskId: task._id,
    accountId: account?._id ?? null,
    accountName: account?.name ?? "Deleted account",
    rule: STALL_RULE[ruleId]?.label ?? "Activation",
    detail: reason,
  };
}

/** Brings one account's activation task in line with where it is now, e.g. right after a platform event. */
export async function syncAccountActivation(
  ctx: MutationCtx,
  accountId: Id<"accounts">,
  now: number,
) {
  const account = await ctx.db.get(accountId);
  if (!account) return { key: null, changes: [] };
  const events = await accountEvents(ctx, account);
  return await syncAccount(ctx, account, events, now, { fallback: null });
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
  const checked = new Set<Id<"accounts">>();
  const assignees: Assignees = { fallback: null };
  const changes: CheckChange[] = [];
  let stuck = 0;

  for (const account of accounts) {
    checked.add(account._id);
    const events = await accountEvents(ctx, account);
    const result = await syncAccount(ctx, account, events, now, assignees);
    if (result.key) stuck++;
    changes.push(...result.changes);
  }

  for (const task of await openActivationTasks(ctx)) {
    if (task.accountId && checked.has(task.accountId)) continue;
    const account = task.accountId ? await ctx.db.get(task.accountId) : null;
    const events = account ? await accountEvents(ctx, account) : [];
    changes.push(await closeStale(ctx, task, account, events));
  }

  return { checked: accounts.length, stuck, changes };
}

async function openActivationTasks(ctx: QueryCtx) {
  const open: Doc<"tasks">[] = [];
  for (const status of ["todo", "in_progress"] as const) {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_status_position", (q) => q.eq("status", status))
      .collect();
    open.push(...tasks.filter(isOpenActivationTask));
  }
  return open;
}
