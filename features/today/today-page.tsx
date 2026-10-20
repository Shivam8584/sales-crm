"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import Skeleton from "@/components/_ui/skeleton";
import { Page, PageHeader } from "@/components/shell/page";
import AccountLogo from "@/features/accounts/account-logo";
import { StageTag } from "@/features/accounts/stage";
import TaskChecklist, {
  TaskChecklistSkeleton,
} from "@/features/tasks/task-checklist";
import { dayFromToday, type TaskRow } from "@/features/tasks/task-meta";
import { useViewer } from "@/hooks/use-viewer";
import { PRIORITIES } from "@/lib/domain/enums";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TodayLeads from "./today-leads";

const RECENT_ACCOUNTS = 6;
const FULL_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function byUrgency(a: TaskRow, b: TaskRow) {
  if (a.dueDate !== b.dueDate)
    return (a.dueDate ?? "") < (b.dueDate ?? "") ? -1 : 1;
  const priority =
    PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  return priority || a.position - b.position;
}

/** The rep's home: what's late, what's due, what's next, and where they've been working. */
export default function TodayPage() {
  const viewer = useViewer();
  const tasks = useQuery(api.tasks.list, {
    assigneeId: viewer._id,
    done: "recent",
  });
  const accounts = useQuery(api.accounts.list, {});
  const setCreate = useUiStore((state) => state.setCreate);

  const now = new Date();
  const today = dayFromToday(0);
  const weekAhead = dayFromToday(7);

  const groups = useMemo(() => {
    if (!tasks) return undefined;
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const open = tasks.filter((task) => task.status !== "done").sort(byUrgency);
    return {
      overdue: open.filter((task) => task.dueDate && task.dueDate < today),
      today: open.filter((task) => task.dueDate === today),
      upcoming: open.filter(
        (task) =>
          task.dueDate && task.dueDate > today && task.dueDate <= weekAhead,
      ),
      undated: open.filter((task) => !task.dueDate).length,
      doneToday: tasks.filter(
        (task) =>
          task.status === "done" &&
          (task.completedAt ?? 0) >= startOfDay.getTime(),
      ).length,
    };
  }, [tasks, today, weekAhead]);

  const recent = useMemo(
    () =>
      accounts
        ?.filter((account) => account.owner?._id === viewer._id)
        .sort((a, b) => (b.lastActivityAt ?? 0) - (a.lastActivityAt ?? 0))
        .slice(0, RECENT_ACCOUNTS),
    [accounts, viewer._id],
  );

  const firstName = viewer.name.trim().split(/\s+/)[0];
  const nothingDue =
    groups &&
    groups.overdue.length + groups.today.length + groups.upcoming.length === 0;

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
        <div className="mx-auto grid w-full max-w-6xl gap-x-10 gap-y-8 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:py-8">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <div className="flex flex-col gap-1.5">
              <h2 className="text-xl leading-tight font-semibold tracking-[-0.01em]">
                {greeting(now.getHours())}, {firstName}
              </h2>
              <p className="text-fg-secondary text-sm">
                {FULL_DATE.format(now)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Stat
                label="Overdue"
                value={groups?.overdue.length}
                href="#overdue"
                tone={groups?.overdue.length ? "danger" : undefined}
              />
              <Stat
                label="Due today"
                value={groups?.today.length}
                href="#due-today"
              />
              <Stat
                label="Next 7 days"
                value={groups?.upcoming.length}
                href="#upcoming"
              />
              <Stat
                label="Done today"
                value={groups?.doneToday}
                tone={groups?.doneToday ? "success" : undefined}
              />
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-8">
            <TodayLeads />
            {groups === undefined ? (
              <TaskSection id="due-today" title="Due today">
                <TaskChecklistSkeleton rows={3} />
              </TaskSection>
            ) : nothingDue ? (
              <div className="border-border rounded-xl border border-dashed">
                <EmptyState
                  icon={CheckCircleIcon}
                  title="You're all caught up"
                  description={
                    groups.undated > 0
                      ? `Nothing due this week. You have ${groups.undated} open ${groups.undated === 1 ? "task" : "tasks"} without a due date.`
                      : "Nothing due this week. Plan your next follow-up so it doesn't slip."
                  }
                  action={
                    <div className="flex flex-wrap justify-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCreate({ type: "task" })}
                      >
                        <PlusIcon aria-hidden className="size-3" />
                        New task
                      </Button>
                      {groups.undated > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          href="/tasks?view=list"
                        >
                          See all tasks
                        </Button>
                      )}
                    </div>
                  }
                />
              </div>
            ) : (
              <>
                {groups.overdue.length > 0 && (
                  <TaskSection
                    id="overdue"
                    title="Overdue"
                    count={groups.overdue.length}
                    tone="danger"
                  >
                    <TaskChecklist tasks={groups.overdue} />
                  </TaskSection>
                )}
                <TaskSection
                  id="due-today"
                  title="Due today"
                  count={groups.today.length}
                >
                  {groups.today.length > 0 ? (
                    <TaskChecklist tasks={groups.today} />
                  ) : (
                    <p className="caption-style text-fg-tertiary -mt-1">
                      Nothing due today.
                    </p>
                  )}
                </TaskSection>
                <TaskSection
                  id="upcoming"
                  title="Next 7 days"
                  count={groups.upcoming.length}
                >
                  {groups.upcoming.length > 0 ? (
                    <TaskChecklist tasks={groups.upcoming} />
                  ) : (
                    <p className="caption-style text-fg-tertiary -mt-1">
                      Nothing scheduled this week.
                    </p>
                  )}
                </TaskSection>
                {groups.undated > 0 && (
                  <Link
                    href="/tasks?view=list"
                    className="caption-style text-fg-tertiary hover:text-foreground focus-visible:ring-ring -mt-4 w-fit rounded-sm outline-none focus-visible:ring-2"
                  >
                    {groups.undated} open{" "}
                    {groups.undated === 1 ? "task has" : "tasks have"} no due
                    date →
                  </Link>
                )}
              </>
            )}
          </div>

          <aside className="flex min-w-0 flex-col gap-3">
            <div className="flex h-7 items-center justify-between gap-2">
              <h2 className="lead-style font-medium">Recently touched</h2>
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
                  <div
                    key={index}
                    className="flex items-center gap-3 px-2 py-2"
                  >
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
        </div>
      </div>
    </Page>
  );
}

function Stat({
  label,
  value,
  href,
  tone,
}: {
  label: string;
  value: number | undefined;
  href?: string;
  tone?: "danger" | "success";
}) {
  const body = (
    <>
      <span className="caption-style text-fg-secondary">{label}</span>
      <span
        className={cn(
          "text-xl leading-none font-semibold tabular-nums",
          tone === "danger" && "text-danger",
          tone === "success" && "text-success",
        )}
      >
        {value === undefined ? <Skeleton className="h-5 w-6" /> : value}
      </span>
    </>
  );
  const className =
    "bg-card shadow-card flex flex-col gap-2.5 rounded-xl px-3.5 py-3";
  return href && value ? (
    <Link
      href={href}
      className={cn(
        className,
        "hover:bg-raised focus-visible:ring-ring duration-fast transition-colors outline-none focus-visible:ring-2",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

function TaskSection({
  id,
  title,
  count,
  tone,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  tone?: "danger";
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="flex scroll-mt-4 flex-col gap-3"
    >
      <div className="flex h-7 items-center gap-2">
        <h2
          id={`${id}-title`}
          className={cn(
            "lead-style font-medium",
            tone === "danger" && "text-danger",
          )}
        >
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="caption-style text-fg-tertiary tabular-nums">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
