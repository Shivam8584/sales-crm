"use client";

import type { CSSProperties, ReactNode } from "react";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Skeleton from "@/components/_ui/skeleton";
import { cn } from "@/lib/utils";
import { NODE_META } from "./node-meta";

type Analytics = NonNullable<
  FunctionReturnType<typeof api.automations.analytics>
>;

const number = (value: number) => value.toLocaleString("en-IN");

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
    <section
      aria-label={title}
      className={cn(
        "border-border flex min-w-0 flex-col gap-4 border-t pt-4",
        className,
      )}
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="text-sm font-medium">{title}</h2>
        {description && (
          <p className="caption-style text-fg-tertiary text-pretty">
            {description}
          </p>
        )}
      </header>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="caption-style text-fg-tertiary truncate">{label}</dt>
      <dd className="text-lg tabular-nums">{value}</dd>
      {detail && (
        <dd className="caption-style text-fg-tertiary truncate tabular-nums">
          {detail}
        </dd>
      )}
    </div>
  );
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="bg-overlay-2 flex h-2 w-full min-w-0 overflow-hidden rounded-full">
      <span
        className="bg-fg-tertiary h-full w-(--bar) rounded-full transition-[width] duration-300"
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
    <ol className="flex flex-col gap-4" aria-label="Steps">
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
          <li key={step.nodeId} className="flex flex-col gap-1.5">
            <div className="flex min-w-0 items-baseline gap-3">
              <span
                className="min-w-0 flex-1 truncate text-sm"
                title={step.title}
              >
                <span className="text-fg-tertiary">{meta.label} · </span>
                {step.title}
              </span>
              <span className="shrink-0 text-sm tabular-nums">
                {number(step.reached)}
                <span className="sr-only"> reached</span>
              </span>
            </div>
            <Bar value={step.reached} max={max} />
            {detail.length > 0 && (
              <span className="caption-style text-fg-tertiary tabular-nums">
                {detail.join(" · ")}
              </span>
            )}
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
            <th scope="col" className="py-2 pr-2 text-left font-normal">
              Channel
            </th>
            {MESSAGE_COLUMNS.map(([, label]) => (
              <th
                key={label}
                scope="col"
                className="px-2 py-2 text-right font-normal last:pr-0"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, counts]) => (
            <tr key={label} className="border-border border-t">
              <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                {label}
              </th>
              {MESSAGE_COLUMNS.map(([key]) => (
                <td
                  key={key}
                  className={cn(
                    "px-2 py-2.5 text-right last:pr-0",
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
        <p className="caption-style text-fg-tertiary border-border border-t pt-3 leading-snug">
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
      <p className="caption-style text-fg-tertiary">No run has exited early.</p>
    );
  }
  const max = Math.max(...exits.map((item) => item.count));
  return (
    <ul className="flex flex-col gap-3">
      {exits.map((item) => (
        <li key={item.kind} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{item.label}</span>
            <span className="tabular-nums">{number(item.count)}</span>
          </div>
          <Bar value={item.count} max={max} />
        </li>
      ))}
    </ul>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-8">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-16" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

/** How a sequence performs: outcomes, the step funnel, messages and replies. */
export default function AutomationAnalytics({ id }: { id: Id<"automations"> }) {
  const data = useQuery(api.automations.analytics, { id });
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6">
        {data === undefined ? (
          <AnalyticsSkeleton />
        ) : data === null ? null : (
          <>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label="Enrolled" value={number(data.counts.enrolled)} />
              <Stat
                label="Active"
                value={number(data.counts.active)}
                detail={
                  data.counts.paused
                    ? `${number(data.counts.paused)} paused or held`
                    : undefined
                }
              />
              <Stat label="Completed" value={number(data.counts.completed)} />
              <Stat
                label="Exited"
                value={number(data.counts.exited + data.counts.failed)}
                detail={
                  data.counts.failed
                    ? `${number(data.counts.failed)} failed`
                    : undefined
                }
              />
              <Stat
                label="Reply rate"
                value={
                  data.replies.rate === null ? "—" : `${data.replies.rate}%`
                }
                detail={`${number(data.replies.replied)} of ${number(data.replies.contacted)} messaged`}
              />
            </dl>
            <div className="grid items-start gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <Section
                title="Step funnel"
                description="Runs that reached each step of the live version."
              >
                <Funnel steps={data.steps} />
              </Section>
              <div className="flex min-w-0 flex-col gap-6">
                <Section title="Why runs exited">
                  <Exits exits={data.exits} />
                </Section>
                <Section title="Messages">
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
