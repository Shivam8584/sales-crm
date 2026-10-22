"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Avatar from "@/components/_ui/avatar";
import AccountLogo from "@/features/accounts/account-logo";
import { NextAction } from "@/features/ai/next-action";
import { MoneyValue } from "@/features/accounts/record-cells";
import { DealStageTag } from "@/features/deals/stage";
import { DemoTag } from "@/features/leads/lead-meta";
import { SlaCell } from "@/features/leads/sla";
import { firstSentence, stuckFor } from "@/features/activation/stall";
import { AutoTag, DoneToggle, RecordChip } from "@/features/tasks/task-card";
import { DueChip, PriorityChip, chipClass } from "@/features/tasks/task-chips";
import {
  StatusIcon,
  dayFromToday,
  dayPhrase,
  formatDay,
  type TaskRow,
} from "@/features/tasks/task-meta";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import { routes } from "@/lib/routes";

export type WaitingLead = FunctionReturnType<
  typeof api.leads.waiting
>["leads"][number];
export type StuckRow = FunctionReturnType<typeof api.activation.mine>[number];
export type DealRow = FunctionReturnType<typeof api.deals.list>[number];

type RowProps = { active: boolean; onHover: (id: string) => void };

/** A cockpit row: keyboard cursor bar, hover tracking and the shared padding. */
function RowShell({
  id,
  active,
  onHover,
  className,
  children,
}: RowProps & { id: string; className?: string; children: ReactNode }) {
  return (
    <li
      data-today-row={id}
      data-cursor={active}
      onMouseMove={() => !active && onHover(id)}
      className={cn(
        "group/card animate-item-in data-[cursor=true]:bg-well hover:bg-well duration-base relative -mx-3 flex min-h-17 scroll-my-16 items-start gap-4 rounded-2xl px-3 py-2.5 transition-colors hover:duration-[120ms] sm:items-center",
        className,
      )}
    >
      {children}
    </li>
  );
}

const TITLE_LINK =
  "text-body focus-visible:after:ring-ring min-w-0 truncate rounded-sm text-left leading-5 font-medium outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset";

const META = "text-fg-tertiary flex min-w-0 items-center gap-1.5 text-sm";

const LEAD =
  "bg-well group-hover/card:bg-background group-data-[cursor=true]/card:bg-background grid size-11 shrink-0 place-items-center rounded-xl transition-colors";

const StatusDot = ({ tone }: { tone: "warning" | "info" | "danger" }) => (
  <span
    aria-hidden
    className={cn(
      "size-1.5 shrink-0 rounded-full",
      tone === "warning" && "bg-warning",
      tone === "info" && "bg-info",
      tone === "danger" && "bg-danger",
    )}
  />
);

const Dot = () => (
  <span
    aria-hidden
    className="bg-fg-disabled size-0.75 shrink-0 rounded-full"
  />
);

export function TaskItem({ task, ...row }: RowProps & { task: TaskRow }) {
  const setEdit = useUiStore((state) => state.setEdit);
  const done = task.status === "done";
  const hasRecord = Boolean(
    task.person || task.account || task.deal || task.lead,
  );
  return (
    <RowShell id={task._id} {...row}>
      <span className={LEAD}>
        <DoneToggle task={task} className="z-sticky relative" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <button
            type="button"
            onClick={() => setEdit({ type: "task", id: task._id })}
            className={cn(
              TITLE_LINK,
              "cursor-pointer",
              done && "text-fg-tertiary line-through",
            )}
          >
            {task.title}
          </button>
          {hasRecord && (
            <RecordChip
              task={task}
              meta
              className="caption-style z-sticky relative min-w-0"
            />
          )}
        </span>
        <div className="z-sticky relative flex min-w-0 flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap">
          {task.automated && <AutoTag />}
          {task.priority !== "normal" && <PriorityChip task={task} />}
          <DueChip task={task} hideEmpty />
        </div>
      </div>
    </RowShell>
  );
}

export function LeadItem({
  lead,
  slaMs,
  ...row
}: RowProps & { lead: WaitingLead; slaMs: number }) {
  return (
    <RowShell id={lead._id} {...row} className="max-sm:flex-wrap">
      <Avatar name={lead.name} className="size-11 text-sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={routes.lead(lead._id)} className={TITLE_LINK}>
          {lead.name}
        </Link>
        <span className={META}>
          <StatusDot tone={lead.slaBreachedAt ? "danger" : "warning"} />
          <span className="truncate">{lead.companyName}</span>
          <Dot />
          <span className="shrink-0">{LEAD_KIND_LABEL[lead.kind]}</span>
        </span>
        <NextAction type="leads" id={lead._id} />
      </span>
      <span className="flex shrink-0 items-center gap-3 text-sm max-sm:basis-full max-sm:justify-between">
        {lead.demoAt && <DemoTag at={lead.demoAt} />}
        <span className="flex justify-end sm:w-36">
          <SlaCell lead={lead} slaMs={slaMs} />
        </span>
      </span>
    </RowShell>
  );
}

export function StuckItem({ row: item, ...row }: RowProps & { row: StuckRow }) {
  const setEdit = useUiStore((state) => state.setEdit);
  const task = item.task;
  return (
    <RowShell id={item._id} {...row}>
      <AccountLogo
        account={item.account}
        size="md"
        className="size-10 rounded-xl text-sm"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={routes.account(item._id)} className={TITLE_LINK}>
          {item.account.name}
        </Link>
        <span className={META} title={firstSentence(item.playbook)}>
          <StatusDot tone="warning" />
          <span className="truncate">{item.label}</span>
          <Dot />
          <span className="shrink-0 tabular-nums">{stuckFor(item.since)}</span>
        </span>
        <NextAction type="accounts" id={item._id} />
      </span>
      {task && (
        <button
          type="button"
          onClick={() => setEdit({ type: "task", id: task._id })}
          className={cn(chipClass(), "z-sticky relative shrink-0")}
        >
          <StatusIcon status={task.status} />
          {task.status === "done" ? "Followed up" : "Open task"}
        </button>
      )}
    </RowShell>
  );
}

export function DealItem({ deal, ...row }: RowProps & { deal: DealRow }) {
  const late = deal.closeDate !== null && deal.closeDate < dayFromToday(0);
  return (
    <RowShell id={deal._id} {...row}>
      {deal.account ? (
        <AccountLogo
          account={deal.account}
          size="md"
          className="size-10 rounded-xl text-sm"
        />
      ) : (
        <span className={LEAD} />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-center justify-between gap-3">
          <Link href={routes.deal(deal._id)} className={TITLE_LINK}>
            {deal.title}
          </Link>
          <span className="text-body shrink-0 font-semibold">
            <MoneyValue
              totals={deal.amount.amount > 0 ? [deal.amount] : []}
              compact
            />
          </span>
        </span>
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <DealStageTag stage={deal.stage} />
            <span className="text-fg-tertiary truncate text-sm">
              {deal.account?.name ?? "No account"}
            </span>
          </span>
          {deal.closeDate && (
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 text-sm tabular-nums",
                late ? "text-danger" : "text-fg-tertiary",
              )}
            >
              {late
                ? `Was due ${dayPhrase(deal.closeDate)}`
                : formatDay(deal.closeDate)}
            </span>
          )}
        </span>
        <NextAction type="deals" id={deal._id} />
      </span>
    </RowShell>
  );
}
