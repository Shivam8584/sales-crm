"use client";

import Link from "next/link";
import Avatar from "@/components/_ui/avatar";
import Tag from "@/components/_ui/tag";
import AccountLogo from "@/features/accounts/account-logo";
import { cn } from "@/lib/utils";
import TargetIcon from "@/public/assets/icons/target-05.svg";
import UserPlusIcon from "@/public/assets/icons/user-plus.svg";
import TaskChips, { CardSafe } from "./task-chips";
import { StatusIcon, type TaskRow } from "./task-meta";
import { useTaskActions } from "./use-task-actions";

/** A record type the surrounding view already shows, so its chip would repeat it. */
export type HiddenRecord = "account" | "person" | "deal" | "lead";

type ChipRecord = Pick<TaskRow, "account" | "person" | "deal" | "lead">;

function chipTarget(task: ChipRecord, hide?: HiddenRecord) {
  const { person, account, deal, lead } = task;
  if (person && hide !== "person") {
    return {
      href: `/people/${person._id}`,
      label: person.name,
      icon: <Avatar name={person.name} size="xs" />,
      context: !hide && account ? account.name : null,
    };
  }
  if (account && !hide) {
    return {
      href: `/accounts/${account._id}`,
      label: account.name,
      icon: <AccountLogo account={account} size="xs" className="size-4" />,
      context: null,
    };
  }
  if (deal && hide !== "deal") {
    return {
      href: `/deals/${deal._id}`,
      label: deal.title,
      icon: <TargetIcon aria-hidden className="text-fg-tertiary size-3.5" />,
      context: null,
    };
  }
  if (lead && hide !== "lead") {
    return {
      href: `/leads/${lead._id}`,
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
  className,
}: {
  task: ChipRecord;
  hide?: HiddenRecord;
  className?: string;
}) {
  const target = chipTarget(task, hide);
  if (!target) return null;
  return (
    <CardSafe>
      <Link
        href={target.href}
        className={cn(
          "caption-style text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-fast ease-power3-out -mx-1 -my-0.5 flex w-fit max-w-full min-w-0 items-center gap-1.5 rounded-sm px-1 py-0.5 transition-colors outline-none focus-visible:ring-2",
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
          "group/done focus-visible:ring-ring relative -m-1 flex size-5.5 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none after:absolute after:-inset-1 after:content-[''] focus-visible:ring-2",
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

export default function TaskCard({ task }: { task: TaskRow }) {
  const done = task.status === "done";
  return (
    <div className="group/card flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <DoneToggle task={task} className="mt-px" />
        <h3
          className={cn(
            "lead-style line-clamp-2 min-w-0 flex-1 leading-snug font-medium break-words",
            done && "text-fg-secondary",
          )}
        >
          {task.title}
        </h3>
        {task.automated && <AutoTag className="-my-px" />}
      </div>
      <RecordChip task={task} />
      <TaskChips task={task} />
    </div>
  );
}
