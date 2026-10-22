"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
  type SVGProps,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Kbd from "@/components/_ui/kbd";
import SegmentedControl from "@/components/_ui/segmented-control";
import Skeleton from "@/components/_ui/skeleton";
import { DetailSection } from "@/components/record/detail";
import {
  CreateButton,
  Page,
  PageHeader,
  PageStatus,
} from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { TrendCell } from "@/features/accounts/record-cells";
import { StageTag } from "@/features/accounts/stage";
import { useRefreshNextActions } from "@/features/ai/next-action";
import TaskComposer from "@/features/tasks/task-composer";
import {
  byUrgency,
  dayFromToday,
  type TaskRow,
} from "@/features/tasks/task-meta";
import { useTaskActions } from "@/features/tasks/use-task-actions";
import { useViewer } from "@/hooks/use-viewer";
import { isEditableTarget } from "@/lib/keyboard";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import AlertTriangleIcon from "@/public/assets/icons/alert-triangle.svg";
import CalendarIcon from "@/public/assets/icons/calendar-sm.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ClockIcon from "@/public/assets/icons/clock.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import WalletIcon from "@/public/assets/icons/wallet.svg";
import {
  DealItem,
  LeadItem,
  StuckItem,
  TaskItem,
  type DealRow,
  type StuckRow,
  type WaitingLead,
} from "./today-rows";

const RECENT_ACCOUNTS = 6;
const CARD_SECTION =
  "gap-2 px-0 pt-3 pb-0 [&>div:first-child]:px-4 sm:[&>div:first-child]:px-5";
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
  stat: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  items: Item[] | undefined;
  tone?: "danger" | "warning";
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
        stat: "Leads waiting",
        icon: UserPlusIcon,
        items: waiting?.leads.map((lead) => ({
          kind: "lead",
          id: lead._id,
          lead,
        })),
        tone: waiting?.leads.some((lead) => lead.slaBreachedAt)
          ? "danger"
          : undefined,
        empty:
          "No new leads waiting on you. Fresh inbound leads land here with their SLA clock.",
        href: { label: "All leads", to: "/leads?owner=mine" },
      },
      {
        id: "overdue",
        title: "Overdue",
        stat: "Overdue",
        icon: AlertTriangleIcon,
        items: taskItems((task) =>
          Boolean(task.dueDate && task.dueDate < today),
        ),
        tone: "danger",
        empty: "Nothing overdue. You're on top of it.",
      },
      {
        id: "today",
        title: "Due today",
        stat: "Due today",
        icon: ClockIcon,
        items: taskItems((task) => task.dueDate === today),
        empty: "Nothing due today. Plan a follow-up so tomorrow starts warm.",
      },
      {
        id: "upcoming",
        title: "Next 7 days",
        stat: "Next 7 days",
        icon: CalendarIcon,
        items: taskItems((task) =>
          Boolean(
            task.dueDate && task.dueDate > today && task.dueDate <= weekAhead,
          ),
        ),
        empty: "Nothing scheduled this week yet.",
        href: { label: "All tasks", to: "/tasks?view=list" },
      },
      {
        id: "stuck",
        title: "Stuck brands you own",
        stat: "Stuck brands",
        icon: TargetIcon,
        aside: true,
        items: stuck?.map((row) => ({ kind: "stuck", id: row._id, row })),
        tone: "warning",
        empty: "Every brand you own is moving through onboarding.",
        href:
          viewer.role === "rep"
            ? undefined
            : { label: "Activation", to: "/activation?owner=mine" },
      },
      {
        id: "deals",
        title: "Deals closing this week",
        stat: "Closing soon",
        icon: WalletIcon,
        aside: true,
        items: deals?.map((deal) => ({ kind: "deal", id: deal._id, deal })),
        empty: "No deals of yours are due to close this week.",
        href: { label: "Pipeline", to: "/deals?owner=mine" },
      },
    ];
  }, [tasks, waiting, stuck, deals, viewer, today, weekAhead]);

  const { main, aside } = useMemo(() => {
    if (focus) {
      return {
        main: sections.filter((section) => section.id === focus),
        aside: [],
      };
    }
    return {
      main: sections.filter((section) => !section.aside),
      aside: sections.filter((section) => section.aside),
    };
  }, [sections, focus]);
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
        return router.push(`/leads/${item.id}`);
      case "stuck":
        return router.push(`/accounts/${item.id}`);
      case "deal":
        return router.push(`/deals/${item.id}`);
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
              size="xs"
              onClick={() => setComposing(true)}
            >
              <PlusIcon aria-hidden className="size-2.5" />
              Add for today
            </Button>
          ) : undefined
        }
      >
        {section.items === undefined ? (
          <RowsSkeleton />
        ) : section.items.length > 0 ? (
          <ul className="divide-border border-border flex flex-col divide-y border-t">
            {section.items.map(renderItem)}
          </ul>
        ) : (
          !composer && (
            <p className="caption-style text-fg-tertiary px-4 pb-4 leading-snug sm:px-5">
              {section.empty}
            </p>
          )
        )}
        {composer && (
          <div className="px-3 pb-3 sm:px-4">
            <TaskComposer
              assigneeId={viewer._id}
              defaultDueDate={today}
              label="New task due today"
              onClose={() => setComposing(false)}
              className="bg-raised shadow-card"
            />
          </div>
        )}
      </CockpitCard>
    );
  }

  const firstName = viewer.name.trim().split(/\s+/)[0];

  return (
    <Page>
      <PageHeader
        title="Today"
        meta={<PageStatus tone="info">{FULL_DATE.format(now)}</PageStatus>}
        actions={
          <CreateButton onClick={() => setCreate({ type: "task" })}>
            New task
          </CreateButton>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6 lg:py-7">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-xl leading-tight font-semibold tracking-[-0.01em]">
                {greeting(now.getHours())}, {firstName}
              </h2>
              {tasks !== undefined && (
                <p className="caption-style text-fg-tertiary">
                  {completed === 0
                    ? "Nothing closed in the last two weeks. Tick one off to start a streak."
                    : `${doneToday} done today · ${completed} in the last ${TREND_DAYS} days`}
                </p>
              )}
            </div>
            <p className="caption-style text-fg-tertiary hidden items-center gap-1.5 lg:flex">
              <Kbd>J</Kbd>
              <Kbd>K</Kbd> to move · <Kbd>X</Kbd> to complete · <Kbd>Enter</Kbd>{" "}
              to open
            </p>
          </div>

          <SegmentedControl
            label="Focus on one section"
            value={focus ?? "all"}
            onChange={(next) =>
              setFocus(next === "all" ? null : (next as SectionId))
            }
            segments={[
              { value: "all", label: "All", count: loaded ? total : undefined },
              ...sections
                .filter(
                  (section) => section.items?.length || section.id === focus,
                )
                .map((section) => ({
                  value: section.id,
                  label: section.stat,
                  count: section.items?.length,
                })),
            ]}
            className="max-w-full self-start overflow-x-auto"
          />

          {loaded && total === 0 && !focus ? (
            <div className="border-border bg-background rounded-xl border">
              <EmptyState
                icon={CheckCircleIcon}
                title="All clear"
                description="No leads waiting, nothing due and no brand stuck. A good moment to plan the week's follow-ups."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setCreate({ type: "task" })}
                  >
                    <PlusIcon aria-hidden className="size-3" />
                    Plan a follow-up
                  </Button>
                }
              />
            </div>
          ) : (
            <div
              className={cn(
                "grid items-start gap-5",
                !focus && "lg:grid-cols-[minmax(0,1fr)_23rem]",
              )}
            >
              <div className="flex min-w-0 flex-col gap-5">
                {main.map(renderSection)}
              </div>
              {!focus && (
                <div className="flex min-w-0 flex-col gap-5">
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

/** A cockpit block in the record-detail style: eyebrow title, count, link, then rows edge to edge. */
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
    <div className="border-border bg-background min-w-0 overflow-hidden rounded-xl border">
      <DetailSection
        title={section.title}
        divider={false}
        className={CARD_SECTION}
        action={
          <span className="flex items-center gap-2">
            {action}
            {section.href && (
              <Link
                href={section.href.to}
                className="caption-style text-fg-tertiary hover:text-foreground focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
              >
                {section.href.label}
              </Link>
            )}
          </span>
        }
      >
        <span className="sr-only">
          {count === undefined ? "Loading" : `${count} items`}
        </span>
        {children}
      </DetailSection>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="divide-border border-border flex flex-col divide-y border-t">
      {[0, 1].map((index) => (
        <div key={index} className="flex h-13 items-center gap-3 px-4 sm:px-5">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="ml-auto h-3 w-14" />
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
    <div className="border-border bg-background min-w-0 overflow-hidden rounded-xl border">
      <DetailSection
        title="Recently touched"
        divider={false}
        className={CARD_SECTION}
        action={
          <Link
            href="/accounts?view=mine"
            className="caption-style text-fg-tertiary hover:text-foreground focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
          >
            My accounts
          </Link>
        }
      >
        {recent === undefined ? (
          <RowsSkeleton />
        ) : recent.length === 0 ? (
          <p className="caption-style text-fg-tertiary px-4 pb-4 leading-snug sm:px-5">
            Accounts you own show up here.{" "}
            <Link
              href="/accounts"
              className="text-fg-secondary hover:text-foreground underline underline-offset-2"
            >
              Browse accounts
            </Link>
          </p>
        ) : (
          <ul className="divide-border border-border flex flex-col divide-y border-t">
            {recent.map((account) => {
              const trend = account.trend;
              return (
                <li key={account._id}>
                  <Link
                    href={`/accounts/${account._id}`}
                    className="hover:bg-row-hover focus-visible:ring-ring duration-fast flex items-center gap-3 px-4 py-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset sm:px-5"
                  >
                    <AccountLogo account={account} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="lead-style truncate leading-5 font-medium">
                        {account.name}
                      </span>
                      <span className="caption-style text-fg-tertiary truncate">
                        {account.lastActivityAt
                          ? relativeTime(account.lastActivityAt)
                          : "No activity yet"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <StageTag stage={account.stage} />
                      {trend && <TrendCell values={trend} />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </DetailSection>
    </div>
  );
}
