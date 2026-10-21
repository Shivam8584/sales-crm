"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Kbd from "@/components/_ui/kbd";
import Skeleton from "@/components/_ui/skeleton";
import { Page, PageHeader } from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { StageTag } from "@/features/accounts/stage";
import { isOpenStage } from "@/features/deals/stage";
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
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
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
  items: Item[] | undefined;
  tone?: "danger" | "warning";
  empty: string;
  href?: { label: string; to: string };
};

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
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
  const desk = useQuery(api.activation.desk, {});
  const deals = useQuery(api.deals.list, {});
  const accounts = useQuery(api.accounts.list, {});

  const [focus, setFocus] = useState<SectionId | null>(null);
  const [collapsed, setCollapsed] = useState<Set<SectionId>>(new Set());
  const [cursor, setCursor] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const today = dayFromToday(0);
  const weekAhead = dayFromToday(7);
  const now = new Date();

  const sections = useMemo((): Section[] => {
    const open = tasks
      ?.filter((task) => task.status !== "done")
      .sort(byUrgency);
    const taskItems = (filter: (task: TaskRow) => boolean) =>
      open
        ?.filter(filter)
        .map((task): Item => ({ kind: "task", id: task._id, task }));
    const rules = new Map(desk?.rules.map((rule) => [rule.id, rule]) ?? []);
    return [
      {
        id: "leads",
        title: "Leads waiting",
        stat: "Leads waiting",
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
        items: taskItems((task) => task.dueDate === today),
        empty: "Nothing due today. Plan a follow-up so tomorrow starts warm.",
      },
      {
        id: "upcoming",
        title: "Next 7 days",
        stat: "Next 7 days",
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
        items: desk?.rows
          .filter((row) => row.owner?._id === viewer._id)
          .sort((a, b) => a.since - b.since)
          .map((row) => {
            const rule = rules.get(row.ruleId);
            return {
              kind: "stuck",
              id: row._id,
              row: {
                ...row,
                label: rule?.label ?? "Stuck",
                playbook: rule?.playbook ?? "",
              },
            };
          }),
        tone: "warning",
        empty: "Every brand you own is moving through onboarding.",
        href: { label: "Activation", to: "/activation?owner=mine" },
      },
      {
        id: "deals",
        title: "Deals closing this week",
        stat: "Closing this week",
        items: deals
          ?.filter(
            (deal) =>
              deal.ownerId === viewer._id &&
              isOpenStage(deal.stage) &&
              deal.closeDate !== null &&
              deal.closeDate <= weekAhead,
          )
          .sort((a, b) => (a.closeDate! < b.closeDate! ? -1 : 1))
          .map((deal) => ({ kind: "deal", id: deal._id, deal })),
        empty: "No deals of yours are due to close this week.",
        href: { label: "Pipeline", to: "/deals?owner=mine" },
      },
    ];
  }, [tasks, waiting, desk, deals, viewer._id, today, weekAhead]);

  const visible = focus
    ? sections.filter((section) => section.id === focus)
    : sections;
  const navigable = useMemo(
    () =>
      visible.flatMap((section) =>
        collapsed.has(section.id) ? [] : (section.items ?? []),
      ),
    [visible, collapsed],
  );
  const activeCursor =
    cursor && navigable.some((item) => item.id === cursor) ? cursor : null;

  const loaded = sections.every((section) => section.items !== undefined);
  const total = sections.reduce(
    (sum, section) => sum + (section.items?.length ?? 0),
    0,
  );
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const doneToday =
    tasks?.filter(
      (task) =>
        task.status === "done" &&
        (task.completedAt ?? 0) >= startOfDay.getTime(),
    ).length ?? 0;

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
          if (!item) return;
          event.preventDefault();
          return openItem(item);
        case "x":
          if (item?.kind !== "task") return;
          event.preventDefault();
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

  function toggle(id: SectionId) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

  const firstName = viewer.name.trim().split(/\s+/)[0];

  return (
    <Page>
      <PageHeader
        title="Today"
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreate({ type: "task" })}
          >
            <PlusIcon aria-hidden className="size-3" />
            New task
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:py-8">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div className="flex flex-col gap-1.5">
                <h2 className="text-xl leading-tight font-semibold tracking-[-0.01em]">
                  {greeting(now.getHours())}, {firstName}
                </h2>
                <p className="text-fg-secondary text-sm">
                  {FULL_DATE.format(now)}
                  {doneToday > 0 && (
                    <span className="text-success">
                      {" · "}
                      {doneToday} done today
                    </span>
                  )}
                </p>
              </div>
              <p className="caption-style text-fg-tertiary hidden items-center gap-1.5 lg:flex">
                <Kbd>J</Kbd>
                <Kbd>K</Kbd> to move · <Kbd>X</Kbd> to complete ·{" "}
                <Kbd>Enter</Kbd> to open
              </p>
            </div>
            <div
              role="group"
              aria-label="Focus on one section"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6"
            >
              {sections.map((section) => (
                <FocusStat
                  key={section.id}
                  section={section}
                  active={focus === section.id}
                  onClick={() =>
                    setFocus(focus === section.id ? null : section.id)
                  }
                />
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            {loaded && total === 0 && !focus ? (
              <div className="border-border rounded-xl border border-dashed">
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
              visible.map((section) => (
                <CockpitSection
                  key={section.id}
                  section={section}
                  collapsed={collapsed.has(section.id)}
                  onToggle={() => toggle(section.id)}
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
                    <SectionSkeleton />
                  ) : section.items.length > 0 ? (
                    <ul className="border-border divide-border flex flex-col divide-y overflow-hidden rounded-xl border">
                      {section.items.map(renderItem)}
                    </ul>
                  ) : (
                    !(section.id === "today" && composing) && (
                      <p className="caption-style text-fg-tertiary -mt-1 pl-5">
                        {section.empty}
                      </p>
                    )
                  )}
                  {section.id === "today" && composing && (
                    <TaskComposer
                      assigneeId={viewer._id}
                      defaultDueDate={today}
                      label="New task due today"
                      onClose={() => setComposing(false)}
                      className="border-border border shadow-none"
                    />
                  )}
                </CockpitSection>
              ))
            )}
          </div>

          <RecentAccounts accounts={accounts} viewerId={viewer._id} />
        </div>
      </div>
    </Page>
  );
}

function FocusStat({
  section,
  active,
  onClick,
}: {
  section: Section;
  active: boolean;
  onClick: () => void;
}) {
  const count = section.items?.length;
  const alert = Boolean(count) && section.tone;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "bg-card shadow-card hover:bg-raised focus-visible:ring-ring duration-fast flex min-w-0 cursor-pointer flex-col gap-2.5 rounded-xl px-3.5 py-3 text-left transition-colors outline-none focus-visible:ring-2 max-sm:flex-row-reverse max-sm:items-center max-sm:justify-end max-sm:gap-2 max-sm:px-3 max-sm:py-2.5",
        active && "ring-selected bg-raised ring-2",
      )}
    >
      <span className="caption-style text-fg-secondary truncate">
        {section.stat}
      </span>
      <span
        className={cn(
          "text-xl leading-none font-semibold tabular-nums max-sm:text-base",
          alert && section.tone === "danger" && "text-danger",
          alert && section.tone === "warning" && "text-warning",
          count === 0 && "text-fg-tertiary",
        )}
      >
        {count === undefined ? <Skeleton className="h-5 w-6" /> : count}
      </span>
    </button>
  );
}

function CockpitSection({
  section,
  collapsed,
  onToggle,
  action,
  children,
}: {
  section: Section;
  collapsed: boolean;
  onToggle: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const count = section.items?.length;
  const bodyId = `today-${section.id}`;
  return (
    <section
      aria-labelledby={`${bodyId}-title`}
      className="flex flex-col gap-2.5"
    >
      <div className="flex h-7 items-center gap-2">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={onToggle}
          className="focus-visible:ring-ring -mx-1 flex min-w-0 cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 outline-none focus-visible:ring-2"
        >
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "text-fg-tertiary duration-fast size-2.5 shrink-0 transition-transform",
              collapsed && "-rotate-90",
            )}
          />
          <h2
            id={`${bodyId}-title`}
            className={cn(
              "lead-style truncate font-medium",
              section.tone === "danger" && count ? "text-danger" : undefined,
            )}
          >
            {section.title}
          </h2>
          {count !== undefined && (
            <span className="caption-style text-fg-tertiary tabular-nums">
              {count}
            </span>
          )}
        </button>
        <span className="ml-auto flex items-center gap-2">
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
      </div>
      {!collapsed && (
        <div id={bodyId} className="flex flex-col gap-2">
          {children}
        </div>
      )}
    </section>
  );
}

function SectionSkeleton() {
  return (
    <div className="border-border divide-border flex flex-col divide-y rounded-xl border">
      {[0, 1].map((index) => (
        <div key={index} className="flex h-12 items-center gap-3 px-3">
          <Skeleton className="size-4 rounded-sm" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="ml-auto h-3 w-14" />
        </div>
      ))}
    </div>
  );
}

function RecentAccounts({
  accounts,
  viewerId,
}: {
  accounts: FunctionReturnType<typeof api.accounts.list> | undefined;
  viewerId: string;
}) {
  const recent = accounts
    ?.filter((account) => account.owner?._id === viewerId)
    .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
    .slice(0, RECENT_ACCOUNTS);

  return (
    <aside
      aria-labelledby="recent-title"
      className="flex min-w-0 flex-col gap-2.5"
    >
      <div className="flex h-7 items-center justify-between gap-2">
        <h2 id="recent-title" className="lead-style font-medium">
          Recently touched
        </h2>
        <Link
          href="/accounts?owner=mine"
          className="caption-style text-fg-tertiary hover:text-foreground focus-visible:ring-ring rounded-sm outline-none focus-visible:ring-2"
        >
          My accounts
        </Link>
      </div>
      {recent === undefined ? (
        <div className="flex flex-col gap-1">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex items-center gap-3 px-2 py-2">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : recent.length === 0 ? (
        <p className="caption-style text-fg-tertiary">
          Accounts you own show up here.{" "}
          <Link
            href="/accounts"
            className="text-fg-secondary hover:text-foreground underline underline-offset-2"
          >
            Browse accounts
          </Link>
        </p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {recent.map((account) => (
            <li key={account._id}>
              <Link
                href={`/accounts/${account._id}`}
                className="hover:bg-overlay-1 focus-visible:ring-ring duration-fast flex items-center gap-3 rounded-lg px-2 py-2 transition-colors outline-none focus-visible:ring-2"
              >
                <AccountLogo account={account} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="lead-style truncate font-medium">
                    {account.name}
                  </span>
                  <span className="caption-style text-fg-tertiary truncate">
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
    </aside>
  );
}
