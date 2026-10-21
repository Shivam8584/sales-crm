import type {
  DealStage,
  LeadKind,
  LeadStatus,
  LifecycleStage,
  TaskStatus,
  TimelineKind,
} from "../../lib/domain/enums";
import {
  FORECAST_MONTHS,
  OPEN_DEAL_STAGES,
  isOpenDealStage,
  weightedAmount,
  type OpenDealStage,
} from "../../lib/domain/forecast";
import { LEAD_SOURCE_LABEL, type Utm } from "../../lib/domain/leads";
import {
  CURRENCIES,
  sumMoney,
  type Currency,
  type Money,
} from "../../lib/domain/money";
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
  return {
    open,
    openTotals: sumMoney(
      mine
        .filter((deal) => deal.stage !== "won" && deal.stage !== "lost")
        .map((deal) => deal.amount),
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

const IST = IST_OFFSET_MS;
const WEEK_MS = 7 * DAY_MS;

/** Calendar day in India, `YYYY-MM-DD`. */
export const istDay = (at: number) =>
  new Date(at + IST).toISOString().slice(0, 10);

/** Calendar month in India, `YYYY-MM`. */
export const istMonth = (at: number) => istDay(at).slice(0, 7);

/** Midnight IST on the Monday of the week holding `at`. */
export function istWeekStart(at: number) {
  const day = Math.floor((at + IST) / DAY_MS);
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7;
  return (day - weekday) * DAY_MS - IST;
}

/** `count` week starts ending with the current week, oldest first. */
export function recentWeeks(now: number, count: number) {
  const current = istWeekStart(now);
  return Array.from(
    { length: count },
    (_, index) => current - (count - 1 - index) * WEEK_MS,
  );
}

export function addMonths(month: string, offset: number) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, index - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

/** `count` months ending with the current one, oldest first. */
export function recentMonths(now: number, count: number) {
  const current = istMonth(now);
  return Array.from({ length: count }, (_, index) =>
    addMonths(current, index - (count - 1)),
  );
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

const ACTIVATION_KEY_PREFIX = "activation:";

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

// ---------------------------------------------------------------- Forecast

export type ForecastDealInput = {
  _id: string;
  title: string;
  accountId: string;
  ownerId: string;
  stage: DealStage;
  amount: Money;
  closeDate?: string;
  /** The deal's current proposal is sent or accepted. */
  commit: boolean;
};

export type ForecastBucketKey = "slipped" | "later" | "none" | string;

type StageSlice = { stage: OpenDealStage; amount: number; count: number };

export type ForecastBucket = {
  /** `YYYY-MM`, or slipped (close date passed), later (past the horizon), none (no close date). */
  key: ForecastBucketKey;
  count: number;
  total: number;
  commit: number;
  weighted: number;
  stages: StageSlice[];
};

export type CurrencyForecast = {
  currency: Currency;
  count: number;
  commitCount: number;
  bestCase: number;
  commit: number;
  weighted: number;
  buckets: ForecastBucket[];
};

export type SlippedDeal = {
  _id: string;
  title: string;
  accountId: string;
  ownerId: string;
  stage: OpenDealStage;
  amount: Money;
  closeDate: string;
  daysLate: number;
  commit: boolean;
};

/** Open pipeline per currency, bucketed by close month and split by stage. */
export function forecastReport(deals: ForecastDealInput[], now: number) {
  const today = istDay(now);
  const thisMonth = today.slice(0, 7);
  const months = Array.from({ length: FORECAST_MONTHS }, (_, index) =>
    addMonths(thisMonth, index),
  );
  const last = months[months.length - 1];
  const keys: ForecastBucketKey[] = ["slipped", ...months, "later", "none"];
  const bucketOf = (deal: ForecastDealInput): ForecastBucketKey => {
    if (!deal.closeDate) return "none";
    if (deal.closeDate < today) return "slipped";
    const month = deal.closeDate.slice(0, 7);
    return month > last ? "later" : month;
  };

  const open = deals.flatMap((deal) =>
    isOpenDealStage(deal.stage) ? [{ ...deal, stage: deal.stage }] : [],
  );
  const currencies = [...new Set(open.map((deal) => deal.amount.currency))];

  const byCurrency: CurrencyForecast[] = currencies.map((currency) => {
    const list = open.filter((deal) => deal.amount.currency === currency);
    const buckets = keys.map((key) => {
      const inBucket = list.filter((deal) => bucketOf(deal) === key);
      return {
        key,
        count: inBucket.length,
        total: inBucket.reduce((sum, deal) => sum + deal.amount.amount, 0),
        commit: inBucket
          .filter((deal) => deal.commit)
          .reduce((sum, deal) => sum + deal.amount.amount, 0),
        weighted: inBucket.reduce(
          (sum, deal) => sum + weightedAmount(deal.amount.amount, deal.stage),
          0,
        ),
        stages: OPEN_DEAL_STAGES.map((stage) => {
          const atStage = inBucket.filter((deal) => deal.stage === stage);
          return {
            stage,
            amount: atStage.reduce((sum, deal) => sum + deal.amount.amount, 0),
            count: atStage.length,
          };
        }),
      };
    });
    return {
      currency,
      count: list.length,
      commitCount: list.filter((deal) => deal.commit).length,
      bestCase: buckets.reduce((sum, bucket) => sum + bucket.total, 0),
      commit: buckets.reduce((sum, bucket) => sum + bucket.commit, 0),
      weighted: buckets.reduce((sum, bucket) => sum + bucket.weighted, 0),
      buckets,
    };
  });
  byCurrency.sort(
    (a, b) =>
      b.count - a.count ||
      CURRENCIES.indexOf(a.currency) - CURRENCIES.indexOf(b.currency),
  );

  const slipped: SlippedDeal[] = open
    .filter((deal) => bucketOf(deal) === "slipped")
    .map((deal) => ({
      _id: deal._id,
      title: deal.title,
      accountId: deal.accountId,
      ownerId: deal.ownerId,
      stage: deal.stage,
      amount: deal.amount,
      closeDate: deal.closeDate!,
      daysLate: daysBetween(deal.closeDate!, today),
      commit: deal.commit,
    }))
    .sort((a, b) => b.daysLate - a.daysLate);

  return { today, months, currencies: byCurrency, slipped };
}

// ---------------------------------------------------------------- Revenue

/** An accepted proposal, priced under the policy it was sent with; amounts in paise. */
export type AcceptedProposalInput = {
  _id: string;
  dealId: string;
  accountId: string;
  ownerId: string;
  decidedAt: number;
  take: number;
  margin: number;
  brandCharge: number;
  /** An approver signed off a margin under the policy. */
  approved: boolean;
};

export type RevenueTotals = {
  count: number;
  take: number;
  margin: number;
  brandCharge: number;
  /** margin ÷ brand charge across the proposals; null with nothing billed. */
  marginRate: number | null;
  /** Proposals whose own blended margin is under the floor. */
  belowFloor: number;
  /** Proposals whose own blended margin is under the approval threshold. */
  belowApproval: number;
  approved: number;
};

export type RevenueRow = RevenueTotals & { key: string };

export type MarginPolicy = { marginFloorBps: number; approvalBps: number };

const below = (margin: number, charge: number, bps: number) =>
  margin * 10_000 < bps * charge;

export function revenueTotals(
  items: AcceptedProposalInput[],
  policy: MarginPolicy,
): RevenueTotals {
  const take = items.reduce((sum, item) => sum + item.take, 0);
  const margin = items.reduce((sum, item) => sum + item.margin, 0);
  const brandCharge = items.reduce((sum, item) => sum + item.brandCharge, 0);
  return {
    count: items.length,
    take,
    margin,
    brandCharge,
    marginRate: brandCharge > 0 ? margin / brandCharge : null,
    belowFloor: items.filter((item) =>
      below(item.margin, item.brandCharge, policy.marginFloorBps),
    ).length,
    belowApproval: items.filter((item) =>
      below(item.margin, item.brandCharge, policy.approvalBps),
    ).length,
    approved: items.filter((item) => item.approved).length,
  };
}

function groupRevenue(
  items: AcceptedProposalInput[],
  key: (item: AcceptedProposalInput) => string,
  policy: MarginPolicy,
): RevenueRow[] {
  const groups = new Map<string, AcceptedProposalInput[]>();
  for (const item of items) {
    const list = groups.get(key(item)) ?? [];
    list.push(item);
    groups.set(key(item), list);
  }
  return [...groups]
    .map(([id, list]) => ({ key: id, ...revenueTotals(list, policy) }))
    .sort((a, b) => b.take - a.take);
}

/** Take and margin from accepted proposals: by month, and for the period by account and by rep. */
export function revenueReport(
  items: AcceptedProposalInput[],
  options: {
    period: Period;
    now: number;
    months: number;
    policy: MarginPolicy;
  },
) {
  const windows = periodWindows(options.period, options.now);
  const months = recentMonths(options.now, options.months);
  const current = items.filter((item) =>
    inWindow(item.decidedAt, windows.current),
  );
  return {
    windows,
    policy: options.policy,
    monthly: months.map((month) => ({
      month,
      ...revenueTotals(
        items.filter((item) => istMonth(item.decidedAt) === month),
        options.policy,
      ),
    })),
    current: revenueTotals(current, options.policy),
    previous: revenueTotals(
      items.filter((item) => inWindow(item.decidedAt, windows.previous)),
      options.policy,
    ),
    byAccount: groupRevenue(current, (item) => item.accountId, options.policy),
    byRep: groupRevenue(current, (item) => item.ownerId, options.policy),
  };
}

// ---------------------------------------------------------------- Activation

export type StallTaskInput = {
  automationKey?: string;
  _creationTime: number;
  status: TaskStatus;
};

export type StallTrendRow = {
  ruleId: string;
  /** Stall tasks opened in each week, oldest first. */
  counts: number[];
  total: number;
  /** Open now, whenever they were opened. */
  open: number;
};

export const stallRuleOf = (key: string | undefined) =>
  key?.startsWith(ACTIVATION_KEY_PREFIX) ? key.split(":")[1] : undefined;

/** Stall tasks opened per rule per week, from the activation task keys. */
export function stallTrend(
  tasks: StallTaskInput[],
  ruleIds: readonly string[],
  weeks: number[],
): StallTrendRow[] {
  const end = weeks.length ? weeks[weeks.length - 1] + WEEK_MS : 0;
  return ruleIds.map((ruleId) => {
    const mine = tasks.filter(
      (task) => stallRuleOf(task.automationKey) === ruleId,
    );
    const counts = weeks.map(
      (start) =>
        mine.filter(
          (task) =>
            task._creationTime >= start && task._creationTime < start + WEEK_MS,
        ).length,
    );
    return {
      ruleId,
      counts,
      total: mine.filter(
        (task) => task._creationTime >= weeks[0] && task._creationTime < end,
      ).length,
      open: mine.filter((task) => task.status !== "done").length,
    };
  });
}

export type CohortRow = {
  weekStart: number;
  size: number;
  /** Brands that reached each activation stage, in ACTIVATION_STAGES order. */
  reached: number[];
};

/**
 * Brands grouped by the week they signed up, with how many reached each stage
 * since. A signup without an org counts as signed up only; an org with no
 * signup event is dated by its earliest stage.
 */
export function activationCohorts(
  timelines: Pick<Timelines, "orgs" | "signups" | "attachedUsers">,
  weeks: number[],
): CohortRow[] {
  const units: { start: number; furthest: number }[] = [];
  for (const timeline of timelines.orgs.values()) {
    const times = ACTIVATION_STAGES.flatMap((stage) => timeline[stage] ?? []);
    if (times.length === 0) continue;
    let furthest = 0;
    for (const [index, stage] of ACTIVATION_STAGES.entries()) {
      if (timeline[stage] !== undefined) furthest = index;
    }
    units.push({
      start: timeline.signed_up ?? Math.min(...times),
      furthest,
    });
  }
  for (const [user, at] of timelines.signups) {
    if (!timelines.attachedUsers.has(user))
      units.push({ start: at, furthest: 0 });
  }
  return weeks.map((weekStart) => {
    const cohort = units.filter(
      (unit) => unit.start >= weekStart && unit.start < weekStart + WEEK_MS,
    );
    return {
      weekStart,
      size: cohort.length,
      reached: ACTIVATION_STAGES.map(
        (_, index) => cohort.filter((unit) => unit.furthest >= index).length,
      ),
    };
  });
}

export type ActivationInput = {
  accounts: AccountInput[];
  people: PersonInput[];
  events: EventInput[];
  tasks: StallTaskInput[];
  ruleIds: readonly string[];
  now: number;
  period: Period;
  weeks: number;
};

/** Time between activation steps for the period, stall tasks per week and signup cohorts. */
export function activationReport(input: ActivationInput) {
  const windows = periodWindows(input.period, input.now);
  const timelines = orgTimelines(input.events, input.accounts, input.people);
  const weeks = recentWeeks(input.now, input.weeks);
  return {
    windows,
    hasPlatformEvents: timelines.orgs.size > 0 || timelines.signups.size > 0,
    steps: timeToActivate(timelines.orgs, windows.current),
    previousSteps: timeToActivate(timelines.orgs, windows.previous),
    weeks,
    stalls: stallTrend(input.tasks, input.ruleIds, weeks),
    cohorts: activationCohorts(timelines, weeks),
  };
}
