"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import Kbd from "@/components/_ui/kbd";
import SegmentedControl from "@/components/_ui/segmented-control";
import Skeleton from "@/components/_ui/skeleton";
import Avatar from "@/components/_ui/avatar";
import {
  CreateButton,
  MetaSeparator,
  Page,
  PageHeader,
  PageStatus,
} from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { SlaCell } from "@/features/leads/sla";
import { StageTag } from "@/features/accounts/stage";
import { useRefreshNextActions } from "@/features/ai/next-action";
import TaskComposer from "@/features/tasks/task-composer";
import {
  byUrgency,
  dayFromToday,
  formatDay,
  type TaskRow,
} from "@/features/tasks/task-meta";
import { useTaskActions } from "@/features/tasks/use-task-actions";
import MonthCard from "@/features/targets/month-card";
import { useViewer } from "@/hooks/use-viewer";
import { isEditableTarget } from "@/lib/keyboard";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import PlusIcon from "@/public/assets/icons/plus.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import CheckSquareIcon from "@/public/assets/icons/check-square.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import {
  DealItem,
  LeadItem,
  StuckItem,
  TaskItem,
  type DealRow,
  type StuckRow,
  type WaitingLead,
} from "./today-rows";
import { routes } from "@/lib/routes";

const RECENT_ACCOUNTS = 6;
const TREND_DAYS = 14;
const DAY_MS = 24 * 60 * 60_000;
const OVERLAY = "[role=dialog], [role=menu], [role=listbox]";
const FULL_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

type SectionId = "leads" | "overdue" | "today" | "upcoming" | "stuck" | "deals";

type Item =
  | { kind: "lead"; id: string; lead: WaitingLead }
  | { kind: "task"; id: string; task: TaskRow }
  | { kind: "stuck"; id: string; row: StuckRow }
  | { kind: "deal"; id: string; deal: DealRow };

type Section = {
  id: SectionId;
  title: string;
  items: Item[] | undefined;
  tone?: "danger";
  empty: string;
  href?: { label: string; to: string };
  /** Narrow column next to the task list on wide screens. */
  aside?: boolean;
};

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Tasks completed per local day, oldest first, ending today. */
function completedPerDay(tasks: TaskRow[] | undefined, now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const first = start.getTime() - (TREND_DAYS - 1) * DAY_MS;
  const buckets = Array.from({ length: TREND_DAYS }, () => 0);
  for (const task of tasks ?? []) {
    if (task.status !== "done") continue;
    const at = task.completedAt ?? task.updatedAt;
    if (at < first) continue;
    const day = new Date(at);
    day.setHours(0, 0, 0, 0);
    const index = Math.round((day.getTime() - first) / DAY_MS);
    if (index >= 0 && index < TREND_DAYS) buckets[index]++;
  }
  return buckets;
}

/** The rep's daily cockpit: leads to answer, tasks by due date, stuck brands and deals closing soon. */
export default function TodayPage() {
  const viewer = useViewer();
  const router = useRouter();
  const setCreate = useUiStore((state) => state.setCreate);
  const setEdit = useUiStore((state) => state.setEdit);
  const { setDone } = useTaskActions();

  const tasks = useQuery(api.tasks.list, {
    assigneeId: viewer._id,
    done: "recent",
  });
  const waiting = useQuery(api.leads.waiting, {});
  const stuck = useQuery(api.activation.mine, {});
  const deals = useQuery(api.deals.closing, { by: dayFromToday(7) });
  const recentAccounts = usePaginatedQuery(
    api.accounts.page,
    { ownerId: viewer._id },
    { initialNumItems: RECENT_ACCOUNTS },
  );
  const accounts =
    recentAccounts.status === "LoadingFirstPage"
      ? undefined
      : recentAccounts.results;

  const [focus, setFocus] = useState<SectionId | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [now] = useState(() => new Date());

  const today = dayFromToday(0);
  const weekAhead = dayFromToday(7);

  const sections = useMemo((): Section[] => {
    // A stall's auto task shows on its stuck card, not again in the task lists.
    const stallTasks = new Set(
      stuck?.flatMap((row) => (row.task ? [row.task._id] : [])),
    );
    const open = tasks
      ?.filter((task) => task.status !== "done" && !stallTasks.has(task._id))
      .sort(byUrgency);
    const taskItems = (filter: (task: TaskRow) => boolean) =>
      open
        ?.filter(filter)
        .map((task): Item => ({ kind: "task", id: task._id, task }));
    return [
      {
        id: "leads",
        title: "Leads waiting",
        items: waiting?.leads.map((lead) => ({
          kind: "lead",
          id: lead._id,
          lead,
        })),
        tone: waiting?.leads.some((lead) => lead.slaBreachedAt)
          ? "danger"
          : undefined,
        empty: "No leads waiting.",
        href: { label: "All leads", to: `${routes.leads}?owner=mine` },
      },
      {
        id: "overdue",
        title: "Overdue",
        items: taskItems((task) =>
          Boolean(task.dueDate && task.dueDate < today),
        ),
        tone: "danger",
        empty: "Nothing overdue.",
      },
      {
        id: "today",
        title: "Due today",
        items: taskItems((task) => task.dueDate === today),
        empty: "Nothing due today.",
      },
      {
        id: "upcoming",
        title: "Next 7 days",
        items: taskItems((task) =>
          Boolean(
            task.dueDate && task.dueDate > today && task.dueDate <= weekAhead,
          ),
        ),
        empty: "Nothing scheduled.",
        href: { label: "All tasks", to: `${routes.tasks}?view=list` },
      },
      {
        id: "stuck",
        title: "Stuck brands",
        aside: true,
        items: stuck?.map((row) => ({ kind: "stuck", id: row._id, row })),
        empty: "No stuck brands.",
        href:
          viewer.role === "rep"
            ? undefined
            : { label: "Activation", to: `${routes.activation}?owner=mine` },
      },
      {
        id: "deals",
        title: "Closing this week",
        aside: true,
        items: deals?.map((deal) => ({ kind: "deal", id: deal._id, deal })),
        empty: "No deals closing this week.",
        href: { label: "Pipeline", to: `${routes.deals}?owner=mine` },
      },
    ];
  }, [tasks, waiting, stuck, deals, viewer, today, weekAhead]);

  const spotlight = useMemo((): Item | null => {
    const lead = waiting?.leads[0];
    if (lead) return { kind: "lead", id: lead._id, lead };
    const overdue = sections.find((section) => section.id === "overdue");
    const dueToday = sections.find((section) => section.id === "today");
    return overdue?.items?.[0] ?? dueToday?.items?.[0] ?? null;
  }, [waiting, sections]);

  const { main, aside } = useMemo(() => {
    if (focus) {
      return {
        main: sections.filter((section) => section.id === focus),
        aside: [],
      };
    }
    // The spotlit item sits in the focus card, so its list doesn't repeat it.
    const rest = sections
      .map((section) => ({
        ...section,
        items: section.items?.filter((item) => item.id !== spotlight?.id),
      }))
      .filter(
        (section) =>
          section.id === "today" ||
          section.id === "upcoming" ||
          section.items === undefined ||
          section.items.length > 0,
      );
    return {
      main: rest.filter((section) => !section.aside),
      aside: rest.filter((section) => section.aside),
    };
  }, [sections, focus, spotlight]);
  const navigable = useMemo(
    () => [...main, ...aside].flatMap((section) => section.items ?? []),
    [main, aside],
  );
  const activeCursor =
    cursor && navigable.some((item) => item.id === cursor) ? cursor : null;

  const loaded = sections.every((section) => section.items !== undefined);
  useRefreshNextActions(loaded);
  const total = sections.reduce(
    (sum, section) => sum + (section.items?.length ?? 0),
    0,
  );
  const trend = useMemo(() => completedPerDay(tasks, now), [tasks, now]);
  const completed = trend.reduce((sum, value) => sum + value, 0);
  const doneToday = trend[trend.length - 1];

  function openItem(item: Item) {
    switch (item.kind) {
      case "task":
        return setEdit({ type: "task", id: item.id });
      case "lead":
        return router.push(routes.lead(item.id));
      case "stuck":
        return router.push(routes.account(item.id));
      case "deal":
        return router.push(routes.deal(item.id));
    }
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector(OVERLAY))
        return;
      const index = activeCursor
        ? navigable.findIndex((item) => item.id === activeCursor)
        : -1;
      const item = index >= 0 ? navigable[index] : undefined;
      const move = (delta: number) => {
        if (navigable.length === 0) return;
        event.preventDefault();
        const next =
          index < 0
            ? 0
            : Math.min(navigable.length - 1, Math.max(0, index + delta));
        setCursor(navigable[next].id);
      };
      switch (event.key) {
        case "j":
        case "ArrowDown":
          return move(1);
        case "k":
        case "ArrowUp":
          return move(-1);
        case "Enter":
          if (
            !item ||
            (event.target instanceof Element &&
              event.target.closest("a, button, [role=checkbox]"))
          )
            return;
          event.preventDefault();
          return openItem(item);
        case "x":
          if (item?.kind !== "task") return;
          event.preventDefault();
          setCursor(
            navigable[index + 1]?.id ?? navigable[index - 1]?.id ?? null,
          );
          return void setDone(item.task, item.task.status !== "done");
        case "Escape":
          if (focus) return setFocus(null);
          return setCursor(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!activeCursor) return;
    document
      .querySelector(`[data-today-row="${activeCursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeCursor]);

  function renderItem(item: Item) {
    const props = { active: activeCursor === item.id, onHover: setCursor };
    switch (item.kind) {
      case "task":
        return <TaskItem key={item.id} task={item.task} {...props} />;
      case "lead":
        return (
          <LeadItem
            key={item.id}
            lead={item.lead}
            slaMs={waiting?.slaMs ?? 0}
            {...props}
          />
        );
      case "stuck":
        return <StuckItem key={item.id} row={item.row} {...props} />;
      case "deal":
        return <DealItem key={item.id} deal={item.deal} {...props} />;
    }
  }

  function renderSection(section: Section) {
    const composer = section.id === "today" && composing;
    return (
      <CockpitCard
        key={section.id}
        section={section}
        action={
          section.id === "today" && !composing ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setComposing(true)}
            >
              <PlusIcon aria-hidden className="size-3" />
              Add for today
            </Button>
          ) : undefined
        }
      >
        {section.items === undefined ? (
          <RowsSkeleton />
        ) : section.items.length > 0 ? (
          <ul className={ROWS}>{section.items.map(renderItem)}</ul>
        ) : (
          !composer && (
            <p className="text-fg-tertiary mt-2 text-sm">{section.empty}</p>
          )
        )}
        {composer && (
          <div className="mt-2">
            <TaskComposer
              assigneeId={viewer._id}
              defaultDueDate={today}
              label="New task due today"
              onClose={() => setComposing(false)}
              className="bg-well shadow-none"
            />
          </div>
        )}
      </CockpitCard>
    );
  }

  const firstName = viewer.name.trim().split(/\s+/)[0];
  const counts = Object.fromEntries(
    sections.map((section) => [section.id, section.items?.length ?? 0]),
  ) as Record<SectionId, number>;
  const urgent = counts.leads + counts.overdue;

  return (
    <Page>
      <PageHeader
        title={`${greeting(now.getHours())}, ${firstName}`}
        meta={
          <>
            <span>{FULL_DATE.format(now)}</span>
            {loaded && (
              <>
                <MetaSeparator />
                {urgent > 0 ? (
                  <PageStatus tone="warning">
                    <span className="text-warning font-medium">
                      {counts.leads > 0
                        ? `${counts.leads} ${counts.leads === 1 ? "lead" : "leads"} waiting`
                        : `${counts.overdue} overdue`}
                    </span>
                  </PageStatus>
                ) : (
                  <span>Nothing urgent</span>
                )}
                <MetaSeparator />
                <span>{counts.today} due today</span>
                {counts.stuck > 0 && (
                  <>
                    <MetaSeparator />
                    <span className="max-sm:hidden">
                      {counts.stuck} stuck{" "}
                      {counts.stuck === 1 ? "brand" : "brands"}
                    </span>
                  </>
                )}
              </>
            )}
          </>
        }
        actions={
          <CreateButton
            quiet={Boolean(spotlight)}
            onClick={() => setCreate({ type: "task" })}
          >
            New task
          </CreateButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col px-(--page-x) pb-16">
          <div className="rise flex items-center justify-between gap-6 [--i:1]">
            <SegmentedControl
              label="Focus on one section"
              value={focus ?? "all"}
              onChange={(next) =>
                setFocus(next === "all" ? null : (next as SectionId))
              }
              segments={[
                {
                  value: "all",
                  label: "All",
                  count: loaded ? total : undefined,
                },
                ...sections
                  .filter(
                    (section) => section.items?.length || section.id === focus,
                  )
                  .map((section) => ({
                    value: section.id,
                    label: section.title,
                    count: section.items?.length,
                  })),
              ]}
              className="h-10 max-w-full overflow-x-auto"
            />
            <p className="text-fg-tertiary hidden shrink-0 items-center gap-1.5 text-xs xl:flex">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> to move · <Kbd>X</Kbd> to complete · <Kbd>Enter</Kbd>{" "}
              to open
            </p>
          </div>

          {!focus && (
            <div className="mt-8 grid items-stretch gap-x-8 gap-y-6 lg:grid-cols-12">
              <div className="rise min-w-0 [--i:2] lg:col-span-8">
                {!loaded ? (
                  <Skeleton className="h-60 w-full rounded-4xl" />
                ) : spotlight ? (
                  <FocusCard
                    item={spotlight}
                    slaMs={waiting?.slaMs ?? 0}
                    onDone={(task) => void setDone(task, true)}
                    onOpenTask={(id) => setEdit({ type: "task", id })}
                  />
                ) : (
                  <CaughtUp
                    empty={total === 0}
                    onPlan={() => setCreate({ type: "task" })}
                    trend={
                      tasks === undefined
                        ? undefined
                        : completed === 0
                          ? "Nothing completed in the last 14 days."
                          : `${doneToday} done today · ${completed} in the last ${TREND_DAYS} days`
                    }
                  />
                )}
              </div>
              <div className="rise min-w-0 [--i:3] lg:col-span-4">
                <MonthCard />
              </div>
            </div>
          )}

          {!(loaded && total === 0 && !focus) && (
            <div
              className={cn(
                "mt-12 grid items-start gap-x-8 gap-y-12",
                !focus && "lg:grid-cols-12",
              )}
            >
              <div className="flex min-w-0 flex-col gap-10 lg:col-span-8">
                {main.map(renderSection)}
              </div>
              {!focus && (
                <div className="flex min-w-0 flex-col gap-10 lg:col-span-4">
                  {aside.map(renderSection)}
                  <RecentAccounts accounts={accounts} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}

function FocusCard({
  item,
  slaMs,
  onDone,
  onOpenTask,
}: {
  item: Item;
  slaMs: number;
  onDone: (task: TaskRow) => void;
  onOpenTask: (id: string) => void;
}) {
  if (item.kind === "lead") {
    const { lead } = item;
    return (
      <section className="bg-well flex h-full flex-col justify-between gap-8 rounded-4xl p-6 sm:p-7">
        <div className="flex items-start gap-4 sm:gap-5">
          <Avatar
            name={lead.name}
            className="size-12 text-sm sm:size-14 sm:text-base"
          />
          <div className="min-w-0">
            <p
              className={cn(
                "flex items-center gap-1.5 text-sm font-medium",
                lead.slaBreachedAt ? "text-danger" : "text-warning",
              )}
            >
              <ClockIcon aria-hidden className="size-3.5 shrink-0" />
              Waiting for a first reply · <SlaCell lead={lead} slaMs={slaMs} />
            </p>
            <h2 className="mt-2 text-xl leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-2xl">
              {lead.name}
              {lead.companyName && (
                <span className="text-fg-secondary">
                  {" "}
                  from {lead.companyName}
                </span>
              )}
            </h2>
            <p className="text-body text-fg-secondary mt-2 max-w-[48ch] text-pretty">
              {LEAD_KIND_LABEL[lead.kind]} lead, arrived{" "}
              {relativeTime(lead._creationTime)}.
              {lead.demoAt && " A demo is booked."}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:pl-19">
          <Button href={routes.lead(lead._id)} variant="primary" size="lg">
            Open lead
          </Button>
          <Button
            href={`${routes.leads}?owner=mine`}
            variant="secondary"
            size="lg"
          >
            All leads
          </Button>
        </div>
      </section>
    );
  }
  if (item.kind !== "task") return null;
  const { task } = item;
  const overdue = Boolean(task.dueDate && task.dueDate < dayFromToday(0));
  const record =
    task.account?.name ?? task.deal?.title ?? task.lead?.name ?? null;
  return (
    <section className="bg-well flex h-full flex-col justify-between gap-8 rounded-4xl p-6 sm:p-7">
      <div className="flex items-start gap-4 sm:gap-5">
        <span className="bg-background text-fg-secondary shadow-tile grid size-12 shrink-0 place-items-center rounded-2xl sm:size-14">
          <CheckSquareIcon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <p
            className={cn(
              "flex items-center gap-1.5 text-sm font-medium",
              overdue ? "text-danger" : "text-warning",
            )}
          >
            <ClockIcon aria-hidden className="size-3.5 shrink-0" />
            {overdue && task.dueDate
              ? `Overdue since ${formatDay(task.dueDate)}`
              : "Due today"}
          </p>
          <h2 className="mt-2 text-xl leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-2xl">
            {task.title}
          </h2>
          {record && (
            <p className="text-body text-fg-secondary mt-2">{record}</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:pl-19">
        <Button variant="primary" size="lg" onClick={() => onDone(task)}>
          Mark done
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={() => onOpenTask(task._id)}
        >
          Open task
        </Button>
      </div>
    </section>
  );
}

function CaughtUp({
  empty,
  trend,
  onPlan,
}: {
  empty: boolean;
  trend?: string;
  onPlan: () => void;
}) {
  return (
    <section className="bg-well flex h-full flex-col justify-between gap-6 rounded-4xl p-6 sm:p-7">
      <div className="flex items-start gap-4">
        <span className="bg-background text-success shadow-tile grid size-12 shrink-0 place-items-center rounded-full">
          <CheckCircleIcon aria-hidden className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="title-style">
            {empty ? "You're all caught up" : "Nothing urgent"}
          </h2>
          <p className="text-fg-secondary mt-1 text-sm text-pretty">
            {empty
              ? "No leads waiting and nothing due. New work shows up here."
              : "No leads waiting and nothing overdue or due today."}
          </p>
          {trend && <p className="text-fg-tertiary mt-3 text-xs">{trend}</p>}
        </div>
      </div>
      {empty && (
        <div className="sm:pl-16">
          <Button variant="primary" size="md" onClick={onPlan}>
            Plan a follow-up
          </Button>
        </div>
      )}
    </section>
  );
}

function SectionHead({
  title,
  count,
  danger,
  children,
}: {
  title: string;
  count?: number;
  danger?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-7 items-center gap-1.5">
      <h3 className="title-style">{title}</h3>
      {count !== undefined && count > 0 && (
        <span
          className={cn(
            "text-title font-medium tabular-nums",
            danger ? "text-danger" : "text-fg-disabled",
          )}
        >
          {count}
        </span>
      )}
      <span className="ml-auto flex items-center gap-1">{children}</span>
    </div>
  );
}

const SECTION_LINK =
  "text-fg-secondary hover:text-foreground hover:bg-well focus-visible:ring-ring -mr-2 rounded-full px-2 py-1 text-sm font-medium transition-colors outline-none focus-visible:ring-2";
const ROWS = "mt-2 flex flex-col";

function CockpitCard({
  section,
  action,
  children,
}: {
  section: Section;
  action?: ReactNode;
  children: ReactNode;
}) {
  const count = section.items?.length;
  return (
    <section className="rise min-w-0">
      <SectionHead
        title={section.title}
        count={count}
        danger={section.tone === "danger"}
      >
        {action}
        {section.href && (
          <Link href={section.href.to} className={SECTION_LINK}>
            {section.href.label}
          </Link>
        )}
      </SectionHead>
      <span className="sr-only">
        {count === undefined ? "Loading" : `${count} items`}
      </span>
      {children}
    </section>
  );
}

function RowsSkeleton() {
  return (
    <div className={ROWS}>
      {[0, 1].map((index) => (
        <div key={index} className="flex h-17 items-center gap-4">
          <Skeleton className="size-11 rounded-xl" />
          <span className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </span>
        </div>
      ))}
    </div>
  );
}

function RecentAccounts({
  accounts: recent,
}: {
  accounts: FunctionReturnType<typeof api.accounts.page>["page"] | undefined;
}) {
  return (
    <section className="rise min-w-0">
      <SectionHead title="Recently touched">
        <Link href={`${routes.accounts}?view=mine`} className={SECTION_LINK}>
          My accounts
        </Link>
      </SectionHead>
      {recent === undefined ? (
        <RowsSkeleton />
      ) : recent.length === 0 ? (
        <p className="text-fg-tertiary mt-2 text-sm">No accounts yet.</p>
      ) : (
        <ul className={ROWS}>
          {recent.map((account) => (
            <li key={account._id}>
              <Link
                href={routes.account(account._id)}
                className="hover:bg-well focus-visible:ring-ring duration-base -mx-3 flex items-center gap-3.5 rounded-2xl px-3 py-2.5 transition-[background-color,scale] outline-none hover:duration-[120ms] focus-visible:ring-2 active:scale-[0.985]"
              >
                <AccountLogo
                  account={account}
                  size="md"
                  className="size-10 rounded-xl text-sm"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-body truncate font-medium">
                    {account.name}
                  </span>
                  <span className="text-fg-tertiary truncate text-sm">
                    {account.lastActivityAt
                      ? relativeTime(account.lastActivityAt)
                      : "No activity yet"}
                  </span>
                </span>
                <StageTag stage={account.stage} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
