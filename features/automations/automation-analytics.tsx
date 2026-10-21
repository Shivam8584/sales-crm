"use client";

import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Skeleton from "@/components/_ui/skeleton";
import { cn } from "@/lib/utils";
import { NODE_META, toneVars } from "./node-meta";

type Analytics = NonNullable<
  FunctionReturnType<typeof api.automations.analytics>
>;

const number = (value: number) => value.toLocaleString("en-IN");

const CARD =
  "border-border bg-background flex min-w-0 flex-col overflow-hidden rounded-xl border";

function Section({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn(CARD, className)}>
      <header className="flex flex-col gap-1 px-4 pt-3.5 pb-3 sm:px-5">
        <h2 className="text-fg-tertiary text-[11px] leading-4 font-medium tracking-wide uppercase">
          {title}
        </h2>
        {description && (
          <p className="caption-style text-fg-tertiary leading-snug text-pretty">
            {description}
          </p>
        )}
      </header>
      <div className="border-border border-t">{children}</div>
    </section>
  );
}

function Tile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="border-line-strong flex min-w-0 flex-col gap-3 rounded-lg border p-2.75">
      <span className="caption-style text-fg-secondary truncate">{label}</span>
      <span className="truncate text-2xl leading-none font-semibold tabular-nums">
        {value}
      </span>
      <span className="caption-style text-fg-tertiary min-h-4 truncate tabular-nums">
        {detail}
      </span>
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="bg-overlay-2 flex h-2 w-full min-w-0 overflow-hidden rounded-full">
      <span
        className="h-full w-(--bar) rounded-full bg-(--accent) transition-[width] duration-300"
        style={
          { "--bar": `${max ? (value / max) * 100 : 0}%` } as CSSProperties
        }
      />
    </span>
  );
}

function Funnel({ steps }: { steps: Analytics["steps"] }) {
  const max = Math.max(1, ...steps.map((step) => step.reached));
  return (
    <ol className="flex flex-col" aria-label="Steps">
      {steps.map((step) => {
        const meta = NODE_META[step.kind];
        const moves = step.kind !== "exit" && step.kind !== "trigger";
        const detail =
          step.reached === 0
            ? ["Not reached yet"]
            : [
                moves && `${number(step.passed)} went on`,
                step.current > 0 && `${number(step.current)} here now`,
                step.skipped > 0 && `${number(step.skipped)} skipped`,
                step.ended > 0 &&
                  step.kind !== "exit" &&
                  `${number(step.ended)} ended here`,
              ].filter(Boolean);
        return (
          <li
            key={step.nodeId}
            style={toneVars(meta.tone) as CSSProperties}
            className="border-border flex flex-col gap-2 px-4 py-3 not-last:border-b sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-(--accent-border) bg-(--accent-surface)">
                <meta.Icon aria-hidden className="size-3.5 text-(--accent)" />
              </span>
              <span
                className="min-w-0 flex-1 truncate text-sm"
                title={step.title}
              >
                <span className="text-fg-tertiary">{meta.label} · </span>
                {step.title}
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {number(step.reached)}
                <span className="sr-only"> reached</span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5 pl-8.5">
              <Bar value={step.reached} max={max} />
              {detail.length > 0 && (
                <span className="caption-style text-fg-tertiary tabular-nums">
                  {detail.join(" · ")}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const MESSAGE_COLUMNS = [
  ["queued", "Queued"],
  ["sending", "Sending"],
  ["sent", "Sent"],
  ["failed", "Failed"],
] as const;

function Messages({ messages }: { messages: Analytics["messages"] }) {
  const rows = [
    ["Email", messages.email],
    ["WhatsApp", messages.whatsapp],
  ] as const;
  return (
    <div className="flex flex-col">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="caption-style text-fg-tertiary">
            <th scope="col" className="px-4 py-2 text-left font-normal sm:px-5">
              Channel
            </th>
            {MESSAGE_COLUMNS.map(([, label]) => (
              <th
                key={label}
                scope="col"
                className="px-2 py-2 text-right font-normal last:pr-4 sm:last:pr-5"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, counts]) => (
            <tr key={label} className="border-border border-t">
              <th
                scope="row"
                className="px-4 py-2.5 text-left font-medium sm:px-5"
              >
                {label}
              </th>
              {MESSAGE_COLUMNS.map(([key]) => (
                <td
                  key={key}
                  className={cn(
                    "px-2 py-2.5 text-right last:pr-4 sm:last:pr-5",
                    counts[key] === 0 && "text-fg-tertiary",
                    key === "failed" && counts[key] > 0 && "text-danger",
                  )}
                >
                  {number(counts[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {messages.outbox > 0 && (
        <p className="caption-style text-fg-tertiary border-border border-t px-4 py-3 leading-snug sm:px-5">
          {number(messages.outbox)} queued{" "}
          {messages.outbox === 1 ? "message is" : "messages are"} in the outbox:
          no provider is set up for{" "}
          {messages.email.queued && messages.whatsapp.queued
            ? "email or WhatsApp"
            : messages.whatsapp.queued
              ? "WhatsApp"
              : "email"}
          , so nothing was sent.
        </p>
      )}
    </div>
  );
}

function Exits({ exits }: { exits: Analytics["exits"] }) {
  if (!exits.length) {
    return (
      <p className="caption-style text-fg-tertiary px-4 py-6 text-center sm:px-5">
        No run has exited early.
      </p>
    );
  }
  const max = Math.max(...exits.map((item) => item.count));
  return (
    <ul
      className="flex flex-col gap-3 px-4 py-4 sm:px-5"
      style={toneVars("neutral") as CSSProperties}
    >
      {exits.map((item) => (
        <li key={item.kind} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="font-medium tabular-nums">
              {number(item.count)}
            </span>
          </div>
          <Bar value={item.count} max={max} />
        </li>
      ))}
    </ul>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Skeleton className="h-80 rounded-xl" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/** How an automation performs: outcomes, the step funnel, messages and replies. */
export default function AutomationAnalytics({ id }: { id: Id<"automations"> }) {
  const data = useQuery(api.automations.analytics, { id });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6">
        {data === undefined ? (
          <AnalyticsSkeleton />
        ) : data === null ? null : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <Tile label="Enrolled" value={number(data.counts.enrolled)} />
              <Tile
                label="Active"
                value={number(data.counts.active)}
                detail={
                  data.counts.paused
                    ? `${number(data.counts.paused)} paused or held`
                    : "Running or waiting"
                }
              />
              <Tile
                label="Completed"
                value={number(data.counts.completed)}
                detail="Reached the end"
              />
              <Tile
                label="Exited"
                value={number(data.counts.exited + data.counts.failed)}
                detail={
                  data.counts.failed
                    ? `${number(data.counts.failed)} failed`
                    : "Left early"
                }
              />
              <Tile
                label="Reply rate"
                value={
                  data.replies.rate === null ? "—" : `${data.replies.rate}%`
                }
                detail={`${number(data.replies.replied)} of ${number(data.replies.contacted)} messaged`}
              />
            </div>
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Section
                title="Step funnel"
                description="Runs that reached each step of the live version, in the order a run meets them."
              >
                <Funnel steps={data.steps} />
              </Section>
              <div className="flex min-w-0 flex-col gap-5">
                <Section
                  title="Why runs exited"
                  description="Runs that left before the end, by reason."
                >
                  <Exits exits={data.exits} />
                </Section>
                <Section
                  title="Messages"
                  description="Emails and WhatsApp templates the automation queued, by delivery status."
                >
                  <Messages messages={data.messages} />
                </Section>
              </div>
            </div>
            {data.truncated && (
              <p className="caption-style text-fg-tertiary">
                Counts cover the newest 5,000 runs.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
