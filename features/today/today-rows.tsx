"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import Tag from "@/components/_ui/tag";
import { NextAction } from "@/features/ai/next-action";
import {
  ActivationCell,
  MoneyValue,
  activationSteps,
} from "@/features/accounts/record-cells";
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
        "group/card animate-item-in data-[cursor=true]:bg-row-hover duration-fast before:bg-selected relative flex min-h-13 scroll-my-16 items-start gap-3 px-4 py-3 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:opacity-0 data-[cursor=true]:before:opacity-100 sm:items-center sm:px-5",
        className,
      )}
    >
      {children}
    </li>
  );
}

const TITLE_LINK =
  "lead-style focus-visible:after:ring-ring min-w-0 truncate rounded-sm text-left leading-5 font-medium outline-none after:absolute after:inset-0 after:rounded-[inherit] focus-visible:after:ring-2 focus-visible:after:ring-inset";

const META = "caption-style text-fg-tertiary flex min-w-0 items-center gap-1.5";

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
      <DoneToggle task={task} className="z-sticky relative mt-0.75" />
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
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={routes.lead(lead._id)} className={TITLE_LINK}>
          {lead.name}
        </Link>
        <span className={META}>
          <span className="truncate">{lead.companyName}</span>
          <Dot />
          <span className="shrink-0">{LEAD_KIND_LABEL[lead.kind]}</span>
        </span>
        <NextAction type="leads" id={lead._id} />
      </span>
      <span className="caption-style flex shrink-0 items-center gap-3 max-sm:basis-full max-sm:justify-between">
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
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex min-w-0 items-center justify-between gap-3">
          <Link href={routes.account(item._id)} className={TITLE_LINK}>
            {item.account.name}
          </Link>
          <span className="caption-style text-fg-tertiary shrink-0 tabular-nums">
            {stuckFor(item.since)}
          </span>
        </span>
        <span className="flex min-w-0 items-center justify-between gap-3">
          <Tag
            tone="amber"
            size="xs"
            title={firstSentence(item.playbook)}
            className="min-w-0"
          >
            <span className="truncate">{item.label}</span>
          </Tag>
          <span className="caption-style z-sticky relative shrink-0">
            <ActivationCell steps={activationSteps(true, item.stage)} />
          </span>
        </span>
        <NextAction type="accounts" id={item._id} />
        {task && (
          <button
            type="button"
            onClick={() => setEdit({ type: "task", id: task._id })}
            className={cn(chipClass(), "z-sticky relative w-fit")}
          >
            <StatusIcon status={task.status} />
            {task.status === "done" ? "Followed up" : "Open task"}
          </button>
        )}
      </span>
    </RowShell>
  );
}

export function DealItem({ deal, ...row }: RowProps & { deal: DealRow }) {
  const late = deal.closeDate !== null && deal.closeDate < dayFromToday(0);
  return (
    <RowShell id={deal._id} {...row}>
      <span className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="flex min-w-0 items-center justify-between gap-3">
          <Link href={routes.deal(deal._id)} className={TITLE_LINK}>
            {deal.title}
          </Link>
          <span className="lead-style shrink-0">
            <MoneyValue
              totals={deal.amount.amount > 0 ? [deal.amount] : []}
              compact
            />
          </span>
        </span>
        <span className="flex min-w-0 items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1.5">
            <DealStageTag stage={deal.stage} />
            <span className="caption-style text-fg-tertiary truncate">
              {deal.account?.name ?? "No account"}
            </span>
          </span>
          {deal.closeDate && (
            <span
              className={cn(
                "caption-style flex shrink-0 items-center gap-1 tabular-nums",
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
