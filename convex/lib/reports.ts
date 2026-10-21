import type {
  DealStage,
  LeadKind,
  LeadStatus,
  LifecycleStage,
  TaskStatus,
  TimelineKind,
} from "../../lib/domain/enums";
import { weightedAmount, type OpenDealStage } from "../../lib/domain/forecast";
import { LEAD_SOURCE_LABEL, type Utm } from "../../lib/domain/leads";
import { sumMoney, type Money } from "../../lib/domain/money";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
  eventStage,
  type ActivationStage,
} from "../../lib/domain/platform";

/**
 * Pure aggregation for the reports page. Kept free of Convex APIs so it can be
 * checked against hand-computed fixtures outside the backend.
 */

export const PERIODS = ["7d", "30d", "90d", "quarter"] as const;
export type Period = (typeof PERIODS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
// Quarters follow the Indian calendar, so boundaries are midnight IST.
const IST_OFFSET_MS = 330 * 60 * 1000;
const PERIOD_DAYS: Record<Exclude<Period, "quarter">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

export type Window = { start: number; end: number };
export type PeriodWindows = { current: Window; previous: Window };

/** The selected window and the one it is compared with; a partial quarter is compared with the same span of the previous quarter. */
export function periodWindows(period: Period, now: number): PeriodWindows {
  if (period === "quarter") {
    const local = new Date(now + IST_OFFSET_MS);
    const year = local.getUTCFullYear();
    const month = Math.floor(local.getUTCMonth() / 3) * 3;
    const start = Date.UTC(year, month, 1) - IST_OFFSET_MS;
    const previousStart = Date.UTC(year, month - 3, 1) - IST_OFFSET_MS;
    return {
      current: { start, end: now },
      previous: {
        start: previousStart,
        end: Math.min(start, previousStart + (now - start)),
      },
    };
  }
  const span = PERIOD_DAYS[period] * DAY_MS;
  return {
    current: { start: now - span, end: now },
    previous: { start: now - 2 * span, end: now - span },
  };
}

const inWindow = (at: number | undefined, window: Window) =>
  at !== undefined && at >= window.start && at < window.end;

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Nearest-rank percentile, so the result is always an observed value. */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1];
}

export type LeadInput = {
  _id: string;
  _creationTime: number;
  kind: LeadKind;
  source: string;
  utm: Utm;
  status: LeadStatus;
  ownerId?: string;
  firstTouchedAt?: number;
  slaBreachedAt?: number;
  demoAt?: number;
  accountId?: string;
};
export type AccountInput = {
  _id: string;
  _creationTime: number;
  stage: LifecycleStage;
  ownerId: string;
  platformOrgId?: string;
  archivedAt?: number;
};
export type PersonInput = { accountId?: string; platformUserId?: string };
export type EventInput = {
  type: string;
  orgId?: string;
  userId?: string;
  occurredAt: number;
  payload: string;
  processedAt?: number;
  ignored?: string;
};
export type DealInput = {
  stage: DealStage;
  amount: Money;
  ownerId: string;
  closedAt?: number;
};
export type Filters = { source?: string; owner?: string };
export const UNASSIGNED = "unassigned";

export const FUNNEL_STEPS = [
  { key: "lead", label: "Leads" },
  { key: "contacted", label: "Contacted" },
  { key: "demo", label: "Demo booked" },
  { key: "converted", label: "Converted to account" },
  { key: "signed_up", label: ACTIVATION_STEP_LABEL.signed_up },
  { key: "org_created", label: ACTIVATION_STEP_LABEL.org_created },
  { key: "funded", label: ACTIVATION_STEP_LABEL.funded },
  { key: "live", label: ACTIVATION_STEP_LABEL.live },
  { key: "activated", label: ACTIVATION_STEP_LABEL.activated },
] as const;
export type FunnelStepKey = (typeof FUNNEL_STEPS)[number]["key"];
export const FIRST_PLATFORM_STEP = 4;

const step = (key: FunnelStepKey) =>
  FUNNEL_STEPS.findIndex((item) => item.key === key);
const CONTACTED = step("contacted");
const DEMO = step("demo");
const CONVERTED = step("converted");
const SIGNED_UP = step("signed_up");
const ACTIVATED = step("activated");

const STAGE_STEP: Partial<Record<LifecycleStage, number>> = {
  qualified: CONTACTED,
  demo: DEMO,
  signed_up: step("signed_up"),
  org_created: step("org_created"),
  funded: step("funded"),
  live: step("live"),
  activated: ACTIVATED,
  expanding: ACTIVATED,
};

const WORKED: LeadStatus[] = ["contacted", "qualified", "nurture", "converted"];

export const DIRECT_SOURCE = "direct";
export const ACCOUNT_SOURCE = "account";

/** Groups leads by UTM source, then by how they entered the CRM; form leads without UTM are direct. */
export function sourceOf(lead: Pick<LeadInput, "utm" | "source">) {
  const utm = lead.utm.source?.trim().toLowerCase();
  if (utm) return { key: `utm:${utm}`, label: utm };
  if (lead.source && lead.source !== "demo_form") {
    return {
      key: `src:${lead.source}`,
      label: LEAD_SOURCE_LABEL[lead.source] ?? lead.source,
    };
  }
  return { key: DIRECT_SOURCE, label: "Direct / unknown" };
}
const ACCOUNT_SOURCE_LABEL = "Added as account";

type Timeline = Partial<Record<ActivationStage, number>>;

function readPayload(payload: string): Record<string, unknown> {
  try {
    const data: unknown = JSON.parse(payload);
    return data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** First time each org reached each activation stage, from platform events. */
export function orgTimelines(
  events: EventInput[],
  accounts: AccountInput[],
  people: PersonInput[],
) {
  const orgs = new Map<string, Timeline>();
  const signups = new Map<string, number>();
  const creators = new Map<string, string>();
  const earliest = (timeline: Timeline, stage: ActivationStage, at: number) => {
    const current = timeline[stage];
    if (current === undefined || at < current) timeline[stage] = at;
  };

  for (const event of events) {
    if (event.ignored || event.processedAt === undefined) continue;
    const data = readPayload(event.payload);
    const stage = eventStage(event.type, data);
    if (!stage) continue;
    if (stage === "signed_up") {
      if (!event.userId) continue;
      const current = signups.get(event.userId);
      if (current === undefined || event.occurredAt < current) {
        signups.set(event.userId, event.occurredAt);
      }
      continue;
    }
    if (!event.orgId) continue;
    const timeline = orgs.get(event.orgId) ?? {};
    earliest(timeline, stage, event.occurredAt);
    orgs.set(event.orgId, timeline);
    if (event.type === "organization.created") {
      const creator = data.created_by;
      if (typeof creator === "string") creators.set(event.orgId, creator);
    }
  }

  const usersByAccount = new Map<string, string[]>();
  for (const person of people) {
    if (!person.accountId || !person.platformUserId) continue;
    const list = usersByAccount.get(person.accountId) ?? [];
    list.push(person.platformUserId);
    usersByAccount.set(person.accountId, list);
  }
  const orgAccount = new Map<string, string>();
  for (const account of accounts) {
    if (account.platformOrgId)
      orgAccount.set(account.platformOrgId, account._id);
  }

  const attachedUsers = new Set<string>();
  for (const [orgId, timeline] of orgs) {
    const accountId = orgAccount.get(orgId);
    const users = [
      creators.get(orgId),
      ...(accountId ? (usersByAccount.get(accountId) ?? []) : []),
    ];
    for (const user of users) {
      if (!user) continue;
      attachedUsers.add(user);
      const at = signups.get(user);
      if (at !== undefined) earliest(timeline, "signed_up", at);
    }
  }

  return { orgs, orgAccount, usersByAccount, signups, attachedUsers };
}

type Timelines = ReturnType<typeof orgTimelines>;

/** Furthest funnel step each account has reached, from its stage, its people and its org's events. */
export function accountSteps(accounts: AccountInput[], timelines: Timelines) {
  const steps = new Map<string, number>();
  for (const account of accounts) {
    let furthest = Math.max(CONVERTED, STAGE_STEP[account.stage] ?? 0);
    const users = timelines.usersByAccount.get(account._id) ?? [];
    if (users.length > 0) furthest = Math.max(furthest, SIGNED_UP);
    const timeline = account.platformOrgId
      ? timelines.orgs.get(account.platformOrgId)
      : undefined;
    if (timeline) {
      for (const stage of ACTIVATION_STAGES) {
        if (timeline[stage] !== undefined) {
          furthest = Math.max(furthest, step(stage));
        }
      }
    }
    steps.set(account._id, furthest);
  }
  return steps;
}

/** One record in the funnel cohort: a lead, or an account that did not come from a lead. */
export type Unit = {
  sourceKey: string;
  sourceLabel: string;
  ownerId: string | undefined;
  createdAt: number;
  furthest: number;
  lead?: LeadInput;
};

export function leadStep(
  lead: LeadInput,
  accountStep: Map<string, number>,
): number {
  let furthest = 0;
  if (lead.firstTouchedAt !== undefined || WORKED.includes(lead.status)) {
    furthest = CONTACTED;
  }
  if (lead.demoAt !== undefined) furthest = Math.max(furthest, DEMO);
  if (lead.status === "converted" || lead.accountId) {
    furthest = Math.max(furthest, CONVERTED);
  }
  if (lead.kind === "signup") furthest = Math.max(furthest, SIGNED_UP);
  const account = lead.accountId ? accountStep.get(lead.accountId) : undefined;
  return account === undefined ? furthest : Math.max(furthest, account);
}

export function buildUnits(
  leads: LeadInput[],
  accounts: AccountInput[],
  accountStep: Map<string, number>,
): Unit[] {
  const fromLeads = new Set(leads.flatMap((lead) => lead.accountId ?? []));
  const units: Unit[] = leads.map((lead) => {
    const source = sourceOf(lead);
    return {
      sourceKey: source.key,
      sourceLabel: source.label,
      ownerId: lead.ownerId,
      createdAt: lead._creationTime,
      furthest: leadStep(lead, accountStep),
      lead,
    };
  });
  for (const account of accounts) {
    if (account.archivedAt !== undefined || fromLeads.has(account._id))
      continue;
    units.push({
      sourceKey: ACCOUNT_SOURCE,
      sourceLabel: ACCOUNT_SOURCE_LABEL,
      ownerId: account.ownerId,
      createdAt: account._creationTime,
      furthest: accountStep.get(account._id) ?? CONVERTED,
    });
  }
  return units;
}

const matchesOwner = (ownerId: string | undefined, owner?: string) =>
  !owner || (owner === UNASSIGNED ? !ownerId : ownerId === owner);

export function filterUnits(units: Unit[], filters: Filters) {
  return units.filter(
    (unit) =>
      (!filters.source || unit.sourceKey === filters.source) &&
      matchesOwner(unit.ownerId, filters.owner),
  );
}

export type FunnelStep = {
  key: FunnelStepKey;
  label: string;
  count: number;
  /** Share of the previous step; null for the first step or when the previous step is empty. */
  stepRate: number | null;
  /** Share of the first step. */
  overallRate: number | null;
};

export function funnel(units: Unit[]) {
  const counts = FUNNEL_STEPS.map(
    (_, index) => units.filter((unit) => unit.furthest >= index).length,
  );
  const steps: FunnelStep[] = FUNNEL_STEPS.map((item, index) => ({
    key: item.key,
    label: item.label,
    count: counts[index],
    stepRate:
      index === 0 || counts[index - 1] === 0
        ? null
        : counts[index] / counts[index - 1],
    overallRate: counts[0] === 0 ? null : counts[index] / counts[0],
  }));
  let biggestDrop: FunnelStepKey | null = null;
  let worst = { rate: 1, lost: 0 };
  for (const [index, item] of steps.entries()) {
    if (item.stepRate === null) continue;
    const lost = counts[index - 1] - counts[index];
    if (lost === 0) continue;
    if (
      item.stepRate < worst.rate ||
      (item.stepRate === worst.rate && lost > worst.lost)
    ) {
      worst = { rate: item.stepRate, lost };
      biggestDrop = item.key;
    }
  }
  return { steps, biggestDrop };
}

function touchMs(lead: LeadInput) {
  return lead.firstTouchedAt === undefined
    ? undefined
    : Math.max(0, lead.firstTouchedAt - lead._creationTime);
}

export type SpeedStats = {
  /** Inbound leads in the cohort (manual entries are excluded). */
  leads: number;
  touched: number;
  medianMs: number | null;
  p90Ms: number | null;
  /** Leads whose SLA window has run out or who were touched; the denominator for `withinRate`. */
  due: number;
  within: number;
  withinRate: number | null;
  breached: number;
  /** Untouched leads past their SLA window. */
  waiting: number;
};

export function speedStats(
  leads: LeadInput[],
  slaMs: number,
  now: number,
): SpeedStats {
  const inbound = leads.filter((lead) => lead.kind !== "manual");
  const times: number[] = [];
  let due = 0;
  let within = 0;
  let breached = 0;
  let waiting = 0;
  for (const lead of inbound) {
    const ms = touchMs(lead);
    if (ms !== undefined) {
      times.push(ms);
      due++;
      if (ms <= slaMs) within++;
    } else if (now - lead._creationTime >= slaMs) {
      due++;
      waiting++;
    }
    if (lead.slaBreachedAt !== undefined) breached++;
  }
  return {
    leads: inbound.length,
    touched: times.length,
    medianMs: median(times),
    p90Ms: percentile(times, 90),
    due,
    within,
    withinRate: due === 0 ? null : within / due,
    breached,
    waiting,
  };
}

export type SourceRow = {
  key: string;
  label: string;
  leads: number;
  contacted: number;
  demo: number;
  converted: number;
  activated: number;
  medianSpeedMs: number | null;
};

export function bySource(units: Unit[]): SourceRow[] {
  const groups = new Map<string, Unit[]>();
  for (const unit of units) {
    const list = groups.get(unit.sourceKey) ?? [];
    list.push(unit);
    groups.set(unit.sourceKey, list);
  }
  return [...groups].map(([key, list]) => {
    const reached = (index: number) =>
      list.filter((unit) => unit.furthest >= index).length;
    const times = list.flatMap((unit) =>
      unit.lead && unit.lead.kind !== "manual"
        ? (touchMs(unit.lead) ?? [])
        : [],
    );
    return {
      key,
      label: list[0].sourceLabel,
      leads: list.length,
      contacted: reached(CONTACTED),
      demo: reached(DEMO),
      converted: reached(CONVERTED),
      activated: reached(ACTIVATED),
      medianSpeedMs: median(times),
    };
  });
}

export type OwnerSpeedRow = SpeedStats & { ownerId: string };

export function speedByOwner(
  leads: LeadInput[],
  slaMs: number,
  now: number,
): OwnerSpeedRow[] {
  const groups = new Map<string, LeadInput[]>();
  for (const lead of leads) {
    if (lead.kind === "manual") continue;
    const key = lead.ownerId ?? UNASSIGNED;
    const list = groups.get(key) ?? [];
    list.push(lead);
    groups.set(key, list);
  }
  return [...groups].map(([ownerId, list]) => ({
    ownerId,
    ...speedStats(list, slaMs, now),
  }));
}

export const ACTIVATION_STEPS = [
  ["signed_up", "org_created"],
  ["org_created", "funded"],
  ["funded", "live"],
  ["live", "activated"],
] as const satisfies readonly (readonly [ActivationStage, ActivationStage])[];

export type ActivationStepRow = {
  from: ActivationStage;
  to: ActivationStage;
  /** Orgs that completed the step inside the window. */
  completed: number;
  medianMs: number | null;
  p90Ms: number | null;
  /** Orgs that reached `from` but not yet `to`, as of now. */
  waiting: number;
};

/** Median time between activation stages for orgs that completed each step in the window. */
export function timeToActivate(
  timelines: Map<string, Timeline>,
  window: Window,
) {
  const steps: ActivationStepRow[] = ACTIVATION_STEPS.map(([from, to]) => {
    const durations: number[] = [];
    let waiting = 0;
    for (const timeline of timelines.values()) {
      const start = timeline[from];
      const end = timeline[to];
      if (start === undefined) continue;
      if (end === undefined) {
        waiting++;
        continue;
      }
      if (inWindow(end, window) && end >= start) durations.push(end - start);
    }
    return {
      from,
      to,
      completed: durations.length,
      medianMs: median(durations),
      p90Ms: percentile(durations, 90),
      waiting,
    };
  });
  const overall: number[] = [];
  for (const timeline of timelines.values()) {
    const start = timeline.signed_up;
    const end = timeline.activated;
    if (start !== undefined && end !== undefined && inWindow(end, window)) {
      overall.push(Math.max(0, end - start));
    }
  }
  let slowest: ActivationStage | null = null;
  let slowestMs = -1;
  for (const row of steps) {
    if (row.medianMs !== null && row.medianMs > slowestMs) {
      slowestMs = row.medianMs;
      slowest = row.from;
    }
  }
  return {
    steps,
    overall: { completed: overall.length, medianMs: median(overall) },
    slowest,
  };
}

export type PipelineStage = {
  stage: DealStage;
  count: number;
  totals: Money[];
};

export function pipeline(
  deals: DealInput[],
  owner: string | undefined,
  window: Window,
) {
  const mine = deals.filter((deal) => matchesOwner(deal.ownerId, owner));
  const open: PipelineStage[] = (
    ["discovery", "demo", "proposal", "onboarding"] as const
  ).map((stage) => {
    const list = mine.filter((deal) => deal.stage === stage);
    return {
      stage,
      count: list.length,
      totals: sumMoney(list.map((deal) => deal.amount)),
    };
  });
  const closed = (stage: "won" | "lost") => {
    const list = mine.filter(
      (deal) => deal.stage === stage && inWindow(deal.closedAt, window),
    );
    return {
      count: list.length,
      totals: sumMoney(list.map((deal) => deal.amount)),
    };
  };
  const openDeals = mine.filter(
    (deal) => deal.stage !== "won" && deal.stage !== "lost",
  );
  return {
    open,
    openTotals: sumMoney(openDeals.map((deal) => deal.amount)),
    weightedTotals: sumMoney(
      openDeals.map((deal) => ({
        ...deal.amount,
        amount: weightedAmount(deal.amount.amount, deal.stage as OpenDealStage),
      })),
    ),
    won: closed("won"),
    lost: closed("lost"),
  };
}

export type ReportInput = {
  leads: LeadInput[];
  accounts: AccountInput[];
  people: PersonInput[];
  events: EventInput[];
  deals: DealInput[];
  slaMs: number;
  now: number;
  period: Period;
  filters: Filters;
};

/** Everything the reports page shows, for the selected period and the one before it. */
export function buildReport(input: ReportInput) {
  const windows = periodWindows(input.period, input.now);
  const timelines = orgTimelines(input.events, input.accounts, input.people);
  const steps = accountSteps(input.accounts, timelines);
  const allUnits = buildUnits(input.leads, input.accounts, steps);
  const units = filterUnits(allUnits, input.filters);

  const sources = new Map<string, string>();
  for (const unit of allUnits) {
    if (unit.lead) sources.set(unit.sourceKey, unit.sourceLabel);
  }

  const accountSource = new Map<string, string>();
  for (const lead of [...input.leads].sort(
    (a, b) => a._creationTime - b._creationTime,
  )) {
    if (lead.accountId && !accountSource.has(lead.accountId)) {
      accountSource.set(lead.accountId, sourceOf(lead).key);
    }
  }
  const accountById = new Map(input.accounts.map((item) => [item._id, item]));
  const filtered = Boolean(input.filters.source || input.filters.owner);
  const orgs = new Map<string, Timeline>();
  for (const [orgId, timeline] of timelines.orgs) {
    if (!filtered) {
      orgs.set(orgId, timeline);
      continue;
    }
    const accountId = timelines.orgAccount.get(orgId);
    const account = accountId ? accountById.get(accountId) : undefined;
    if (!account) continue;
    const source = accountSource.get(account._id) ?? ACCOUNT_SOURCE;
    if (input.filters.source && source !== input.filters.source) continue;
    if (!matchesOwner(account.ownerId, input.filters.owner)) continue;
    orgs.set(orgId, timeline);
  }

  const summarize = (window: Window) => {
    const inPeriod = units.filter((unit) => inWindow(unit.createdAt, window));
    // Accounts added without a lead never passed the sales steps, so they are reported beside the funnel.
    const cohort = inPeriod.filter((unit) => unit.lead);
    const direct = inPeriod.filter((unit) => !unit.lead);
    const leads = cohort.flatMap((unit) => unit.lead ?? []);
    return {
      cohort,
      leads,
      direct: {
        accounts: direct.length,
        signedUp: direct.filter((unit) => unit.furthest >= SIGNED_UP).length,
        activated: direct.filter((unit) => unit.furthest >= ACTIVATED).length,
      },
      funnel: funnel(cohort),
      speed: speedStats(leads, input.slaMs, input.now),
      pipeline: pipeline(input.deals, input.filters.owner, window),
    };
  };
  const current = summarize(windows.current);
  const previous = summarize(windows.previous);

  return {
    windows,
    slaMs: input.slaMs,
    sources: [...sources]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    funnel: current.funnel,
    direct: current.direct,
    previousFunnel: previous.funnel.steps.map((item) => item.count),
    bySource: bySource(current.cohort),
    speed: current.speed,
    previousSpeed: previous.speed,
    speedByOwner: speedByOwner(current.leads, input.slaMs, input.now),
    activation: timeToActivate(orgs, windows.current),
    hasPlatformEvents: timelines.orgs.size > 0 || timelines.signups.size > 0,
    pipeline: current.pipeline,
    previousWon: previous.pipeline.won,
  };
}

export type Report = ReturnType<typeof buildReport>;

/** Calendar day in India, `YYYY-MM-DD`. */
export const istDay = (at: number) =>
  new Date(at + IST_OFFSET_MS).toISOString().slice(0, 10);

// ---------------------------------------------------------------- Team

export type TaskInput = {
  assigneeId: string;
  status: TaskStatus;
  dueDate?: string;
  completedAt?: number;
};

/** A timeline entry; only ones a teammate logged themselves count as interactions. */
export type InteractionInput = {
  kind: TimelineKind;
  actorId?: string;
  occurredAt: number;
  automated?: boolean;
};

export type RepPeriod = {
  /** Leads they own that arrived in the period. */
  leads: number;
  speed: SpeedStats;
  tasksDone: number;
  calls: number;
  meetings: number;
  won: number;
  wonValue: Money[];
  /** Accounts they own that first reached Activated in the period. */
  activated: number;
};

export type TeamRow = {
  ownerId: string;
  current: RepPeriod;
  previous: RepPeriod;
  /** Open tasks due before today, as of now. */
  overdue: number;
  /** Accounts they own that are on the platform, as of now. */
  platformAccounts: number;
  activatedAccounts: number;
};

export type TeamInput = {
  leads: LeadInput[];
  tasks: TaskInput[];
  interactions: InteractionInput[];
  deals: DealInput[];
  accounts: AccountInput[];
  people: PersonInput[];
  events: EventInput[];
  /** Active teammates, listed even when they have nothing in the period. */
  memberIds: string[];
  slaMs: number;
  now: number;
  period: Period;
};

const isInteraction = (entry: InteractionInput) =>
  entry.actorId !== undefined && !entry.automated;

/** Per-rep activity for the period and the one before it, plus the team as a whole. */
export function teamReport(input: TeamInput) {
  const windows = periodWindows(input.period, input.now);
  const today = istDay(input.now);
  const timelines = orgTimelines(input.events, input.accounts, input.people);
  const steps = accountSteps(input.accounts, timelines);
  const accounts = input.accounts.filter((a) => a.archivedAt === undefined);
  const activatedAt = new Map<string, number>();
  for (const account of accounts) {
    const at = account.platformOrgId
      ? timelines.orgs.get(account.platformOrgId)?.activated
      : undefined;
    if (at !== undefined) activatedAt.set(account._id, at);
  }
  const interactions = input.interactions.filter(isInteraction);

  const periodStats = (
    window: Window,
    owns: (id: string | undefined) => boolean,
  ): RepPeriod => {
    const leads = input.leads.filter(
      (lead) => owns(lead.ownerId) && inWindow(lead._creationTime, window),
    );
    const won = input.deals.filter(
      (deal) =>
        owns(deal.ownerId) &&
        deal.stage === "won" &&
        inWindow(deal.closedAt, window),
    );
    const logged = interactions.filter(
      (entry) => owns(entry.actorId) && inWindow(entry.occurredAt, window),
    );
    return {
      leads: leads.length,
      speed: speedStats(leads, input.slaMs, input.now),
      tasksDone: input.tasks.filter(
        (task) =>
          owns(task.assigneeId) &&
          task.status === "done" &&
          inWindow(task.completedAt, window),
      ).length,
      calls: logged.filter((entry) => entry.kind === "call").length,
      meetings: logged.filter((entry) => entry.kind === "meeting").length,
      won: won.length,
      wonValue: sumMoney(won.map((deal) => deal.amount)),
      activated: accounts.filter(
        (account) =>
          owns(account.ownerId) &&
          inWindow(activatedAt.get(account._id), window),
      ).length,
    };
  };

  const row = (
    ownerId: string,
    owns: (id: string | undefined) => boolean,
  ): TeamRow => {
    const owned = accounts.filter((account) => owns(account.ownerId));
    const reached = (index: number) =>
      owned.filter((account) => (steps.get(account._id) ?? 0) >= index).length;
    return {
      ownerId,
      current: periodStats(windows.current, owns),
      previous: periodStats(windows.previous, owns),
      overdue: input.tasks.filter(
        (task) =>
          owns(task.assigneeId) &&
          task.status !== "done" &&
          task.dueDate !== undefined &&
          task.dueDate < today,
      ).length,
      platformAccounts: reached(SIGNED_UP),
      activatedAccounts: reached(ACTIVATED),
    };
  };

  const ids = new Set(input.memberIds);
  const seen = (id: string | undefined, at: number | undefined) => {
    if (
      id &&
      (inWindow(at, windows.current) || inWindow(at, windows.previous))
    ) {
      ids.add(id);
    }
  };
  let unassigned = false;
  for (const lead of input.leads) {
    seen(lead.ownerId, lead._creationTime);
    if (
      !lead.ownerId &&
      (inWindow(lead._creationTime, windows.current) ||
        inWindow(lead._creationTime, windows.previous))
    ) {
      unassigned = true;
    }
  }
  for (const task of input.tasks) seen(task.assigneeId, task.completedAt);
  for (const entry of interactions) seen(entry.actorId, entry.occurredAt);
  for (const deal of input.deals) seen(deal.ownerId, deal.closedAt);

  const rows = [...ids].map((id) => row(id, (owner) => owner === id));
  if (unassigned) rows.push(row(UNASSIGNED, (owner) => owner === undefined));

  return {
    windows,
    slaMs: input.slaMs,
    rows,
    team: row("team", () => true),
  };
}
