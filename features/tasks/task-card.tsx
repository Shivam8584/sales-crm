"use client";

import Link from "next/link";
import Avatar from "@/components/_ui/avatar";
import Tag from "@/components/_ui/tag";
import { useCardFields } from "@/components/board/board-prefs";
import AccountLogo from "@/features/accounts/account-logo";
import { shortDate } from "@/lib/time";
import { cn } from "@/lib/utils";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import TaskChips, { CardSafe } from "./task-chips";
import { StatusIcon, type TaskRow } from "./task-meta";
import { useTaskActions } from "./use-task-actions";
import { routes } from "@/lib/routes";

export const TASK_CARD_FIELDS = [
  { id: "priority", label: "Priority" },
  { id: "assignee", label: "Assignee" },
  { id: "due", label: "Due date" },
  { id: "record", label: "Linked record" },
];

/** A record type the surrounding view already shows, so its chip would repeat it. */
export type HiddenRecord = "account" | "person" | "deal" | "lead";

type ChipRecord = Pick<TaskRow, "account" | "person" | "deal" | "lead">;

function chipTarget(task: ChipRecord, hide?: HiddenRecord) {
  const { person, account, deal, lead } = task;
  if (person && hide !== "person") {
    return {
      href: routes.person(person._id),
      label: person.name,
      icon: <Avatar name={person.name} size="xs" />,
      context: !hide && account ? account.name : null,
    };
  }
  if (account && !hide) {
    return {
      href: routes.account(account._id),
      label: account.name,
      icon: <AccountLogo account={account} size="xs" className="size-4" />,
      context: null,
    };
  }
  if (deal && hide !== "deal") {
    return {
      href: routes.deal(deal._id),
      label: deal.title,
      icon: <TargetIcon aria-hidden className="text-fg-tertiary size-3.5" />,
      context: null,
    };
  }
  if (lead && hide !== "lead") {
    return {
      href: routes.lead(lead._id),
      label: lead.name,
      icon: <UserPlusIcon aria-hidden className="text-fg-tertiary size-3.5" />,
      context: null,
    };
  }
  return null;
}

/** Link to the record the task is about; never opens the task itself. */
export function RecordChip({
  task,
  hide,
  meta = false,
  className,
}: {
  task: ChipRecord;
  hide?: HiddenRecord;
  /** Inline in a card's meta line rather than on its own. */
  meta?: boolean;
  className?: string;
}) {
  const target = chipTarget(task, hide);
  if (!target) return null;
  return (
    <CardSafe>
      <Link
        href={target.href}
        className={cn(
          "hover:text-foreground focus-visible:ring-ring duration-fast ease-power3-out -mx-1 -my-0.5 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors outline-none focus-visible:ring-2",
          meta ? "text-fg-tertiary" : "caption-style text-fg-secondary",
          className,
        )}
      >
        {target.icon}
        <span className="truncate">{target.label}</span>
        {target.context && (
          <>
            <span
              aria-hidden
              className="text-fg-tertiary -mx-0.5 max-sm:hidden"
            >
              ·
            </span>
            <span className="text-fg-tertiary truncate max-sm:hidden">
              {target.context}
            </span>
          </>
        )}
      </Link>
    </CardSafe>
  );
}

/** Status icon that completes the task, or reopens it when done. */
export function DoneToggle({
  task,
  className,
}: {
  task: Pick<TaskRow, "_id" | "title" | "status">;
  className?: string;
}) {
  const { setDone } = useTaskActions();
  const done = task.status === "done";
  return (
    <CardSafe>
      <button
        type="button"
        aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={done}
        onClick={() => void setDone(task, !done)}
        className={cn(
          "group/done focus-visible:ring-ring relative flex size-3.5 shrink-0 cursor-pointer items-center justify-center rounded-xs outline-none after:absolute after:-inset-2 after:content-[''] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-(--card) pointer-coarse:after:-inset-3.5",
          className,
        )}
      >
        <StatusIcon
          status={task.status}
          className="duration-fast transition-transform group-hover/done:scale-110 group-active/done:scale-95"
        />
      </button>
    </CardSafe>
  );
}

export function AutoTag({ className }: { className?: string }) {
  return (
    <Tag
      size="xs"
      tone="purple"
      title="Opened automatically"
      className={className}
    >
      Auto
    </Tag>
  );
}

/** Board card body: status and title, created date and record, then property chips. */
export default function TaskCard({ task }: { task: TaskRow }) {
  const show = useCardFields("tasks");
  const done = task.status === "done";
  const hasRecord =
    show("record") &&
    Boolean(task.person || task.account || task.deal || task.lead);
  const hasChips = ["priority", "assignee", "due"].some(show);
  return (
    <>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <DoneToggle task={task} className="mt-0.75" />
          <h3
            className={cn(
              "lead-style line-clamp-2 min-w-0 flex-1 leading-5 font-medium break-words",
              done && "text-fg-secondary",
            )}
          >
            {task.title}
          </h3>
          {task.automated && <AutoTag className="mt-0.5" />}
        </div>
        <div className="text-fg-tertiary flex min-w-0 items-center gap-2 text-[13px] leading-5">
          <span className="shrink-0 whitespace-nowrap">
            Created {shortDate(task._creationTime)}
          </span>
          {hasRecord && (
            <>
              <span
                aria-hidden
                className="bg-fg-disabled size-0.75 shrink-0 rounded-full"
              />
              <RecordChip task={task} meta className="min-w-0" />
            </>
          )}
        </div>
      </div>
      {hasChips && (
        <div className="border-border border-t px-4 py-3">
          <TaskChips task={task} show={show} />
        </div>
      )}
    </>
  );
}
