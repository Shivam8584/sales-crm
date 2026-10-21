"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import AccountLogo from "@/features/accounts/account-logo";
import { DealStageTag } from "@/features/deals/stage";
import { DemoTag } from "@/features/leads/lead-meta";
import SlaIndicator from "@/features/leads/sla";
import { firstSentence, stuckFor } from "@/features/activation/stall";
import { AutoTag, DoneToggle, RecordChip } from "@/features/tasks/task-card";
import { DueChip, PriorityChip } from "@/features/tasks/task-chips";
import {
  dayFromToday,
  dayPhrase,
  type TaskRow,
} from "@/features/tasks/task-meta";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import ArrowRightIcon from "@/public/assets/icons/arrow-right.svg";

export type WaitingLead = FunctionReturnType<
  typeof api.leads.waiting
>["leads"][number];
export type StuckRow = FunctionReturnType<
  typeof api.activation.desk
>["rows"][number] & { label: string; playbook: string };
export type DealRow = FunctionReturnType<typeof api.deals.list>[number];

type RowShellProps = {
  id: string;
  active: boolean;
  onHover: (id: string) => void;
  children: ReactNode;
};

/** A cockpit row: keyboard cursor highlight and hover tracking. */
function RowShell({ id, active, onHover, children }: RowShellProps) {
  return (
    <li
      data-today-row={id}
      data-cursor={active}
      onMouseMove={() => !active && onHover(id)}
      className="group/card data-[cursor=true]:bg-overlay-2 hover:bg-overlay-1 duration-fast relative flex min-h-13 scroll-my-16 items-start gap-3 px-4 py-3 transition-colors sm:items-center"
    >
      {children}
    </li>
  );
}

const TITLE_LINK =
  "lead-style focus-visible:after:ring-ring min-w-0 truncate rounded-sm text-left leading-snug outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset";

export function TaskItem({
  task,
  active,
  onHover,
}: {
  task: TaskRow;
  active: boolean;
  onHover: (id: string) => void;
}) {
  const setEdit = useUiStore((state) => state.setEdit);
  const done = task.status === "done";
  return (
    <RowShell id={task._id} active={active} onHover={onHover}>
      <DoneToggle task={task} className="z-sticky relative mt-0.75 sm:mt-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          onClick={() => setEdit({ type: "task", id: task._id })}
          className={cn(
            TITLE_LINK,
            "cursor-pointer sm:flex-1",
            done && "text-fg-tertiary line-through",
          )}
        >
          {task.title}
        </button>
        <div className="z-sticky relative flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:flex-nowrap">
          {task.automated && <AutoTag />}
          <RecordChip task={task} className="max-w-48" />
          <PriorityChip task={task} />
          <DueChip task={task} hideEmpty />
        </div>
      </div>
    </RowShell>
  );
}

export function LeadItem({
  lead,
  slaMs,
  active,
  onHover,
}: {
  lead: WaitingLead;
  slaMs: number;
  active: boolean;
  onHover: (id: string) => void;
}) {
  return (
    <RowShell id={lead._id} active={active} onHover={onHover}>
      <Avatar name={lead.name} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/leads/${lead._id}`}
          className={cn(TITLE_LINK, "font-medium")}
        >
          {lead.name}
        </Link>
        <span className="caption-style text-fg-tertiary truncate">
          {lead.companyName} · {LEAD_KIND_LABEL[lead.kind]}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        {lead.demoAt && <DemoTag at={lead.demoAt} />}
        <SlaIndicator lead={lead} slaMs={slaMs} />
      </span>
    </RowShell>
  );
}

export function StuckItem({
  row,
  active,
  onHover,
}: {
  row: StuckRow;
  active: boolean;
  onHover: (id: string) => void;
}) {
  const setEdit = useUiStore((state) => state.setEdit);
  const task = row.task;
  return (
    <RowShell id={row._id} active={active} onHover={onHover}>
      <AccountLogo account={row.account} size="sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/accounts/${row._id}`}
          className={cn(TITLE_LINK, "font-medium")}
        >
          {row.account.name}
        </Link>
        <span
          className="caption-style text-fg-tertiary truncate"
          title={row.playbook}
        >
          <span className="text-warning">{row.label}</span> for{" "}
          {stuckFor(row.since)} · {firstSentence(row.playbook)}
        </span>
      </span>
      {task && task.status !== "done" && (
        <button
          type="button"
          onClick={() => setEdit({ type: "task", id: task._id })}
          className="caption-style text-fg-secondary hover:text-foreground hover:bg-overlay-2 focus-visible:ring-ring z-sticky relative inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 outline-none focus-visible:ring-2"
        >
          Open task
          <ArrowRightIcon aria-hidden className="size-3" />
        </button>
      )}
    </RowShell>
  );
}

export function DealItem({
  deal,
  active,
  onHover,
}: {
  deal: DealRow;
  active: boolean;
  onHover: (id: string) => void;
}) {
  const late = deal.closeDate !== null && deal.closeDate < dayFromToday(0);
  return (
    <RowShell id={deal._id} active={active} onHover={onHover}>
      {deal.account ? (
        <AccountLogo account={deal.account} size="sm" />
      ) : (
        <span className="size-6" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/deals/${deal._id}`}
          className={cn(TITLE_LINK, "font-medium")}
        >
          {deal.title}
        </Link>
        <span className="caption-style text-fg-tertiary truncate">
          {deal.account?.name ?? "No account"}
          {deal.amount.amount > 0 && (
            <span className="tabular-nums">
              {" · "}
              {formatMoney(deal.amount, { compact: true })}
            </span>
          )}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
        <DealStageTag stage={deal.stage} />
        {deal.closeDate && (
          <span
            className={cn(
              "caption-style tabular-nums",
              late ? "text-danger" : "text-fg-secondary",
            )}
          >
            {late ? "Was due " : "Closes "}
            {dayPhrase(deal.closeDate)}
          </span>
        )}
      </span>
    </RowShell>
  );
}
