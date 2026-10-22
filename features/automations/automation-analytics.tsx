"use client";

import type { CSSProperties, ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import Skeleton from "@/components/_ui/skeleton";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import { NODE_META } from "./node-meta";

type Analytics = NonNullable<
  FunctionReturnType<typeof api.automations.analytics>
>;

const number = (value: number) => value.toLocaleString("en-IN");
const percentOf = (part: number, whole: number) =>
  Math.round((part / whole) * 1000) / 10;

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

function SplitTests({
  id,
  tests,
}: {
  id: Id<"automations">;
  tests: Analytics["tests"];
}) {
  const setSplit = useMutation(api.automations.setSplit);

  async function send(nodeId: string, splitB: number) {
    try {
      const { previous } = await setSplit({ id, nodeId, splitB });
      toast(
        splitB === 100
          ? "Version B now goes to everyone"
          : "Version A now goes to everyone",
        {
          undo: () =>
            void setSplit({ id, nodeId, splitB: previous }).catch((reason) =>
              toast(readError(reason).message, { tone: "danger" }),
            ),
        },
      );
    } catch (reason) {
      toast(readError(reason).message, { tone: "danger" });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {tests.map((test) => (
        <div key={test.nodeId} className="flex flex-col gap-3">
          <table className="w-full text-sm tabular-nums">
            <caption className="sr-only">{test.title}</caption>
            <thead>
              <tr className="caption-style text-fg-tertiary">
                <th scope="col" className="py-2 pr-2 text-left font-normal">
                  Version
                </th>
                <th scope="col" className="px-2 py-2 text-right font-normal">
                  Sent
                </th>
                <th scope="col" className="px-2 py-2 text-right font-normal">
                  Replied
                </th>
                <th scope="col" className="py-2 pl-2 text-right font-normal">
                  Reply rate
                </th>
              </tr>
            </thead>
            <tbody>
              {(["a", "b"] as const).map((variant) => {
                const row = test[variant];
                return (
                  <tr key={variant} className="border-border border-t">
                    <th
                      scope="row"
                      className="max-w-0 py-2.5 pr-2 text-left font-normal"
                    >
                      <span className="block truncate" title={row.subject}>
                        <span className="text-fg-tertiary">
                          {variant.toUpperCase()} ·{" "}
                        </span>
                        {row.subject}
                      </span>
                    </th>
                    <td className="px-2 py-2.5 text-right">
                      {number(row.sent)}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {number(row.replied)}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 pl-2 text-right",
                        test.leader === variant && "font-medium",
                      )}
                    >
                      {row.sent ? `${percentOf(row.replied, row.sent)}%` : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="caption-style text-fg-tertiary text-pretty">
            {test.summary}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {test.splitB > 0 && test.splitB < 100 ? (
              <>
                <Button size="sm" onClick={() => void send(test.nodeId, 0)}>
                  Send A to everyone
                </Button>
                <Button size="sm" onClick={() => void send(test.nodeId, 100)}>
                  Send B to everyone
                </Button>
              </>
            ) : (
              <>
                <span className="caption-style text-fg-tertiary">
                  {test.splitB === 100 ? "B" : "A"} goes to everyone.
                </span>
                <Button size="sm" onClick={() => void send(test.nodeId, 50)}>
                  Split 50/50 again
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
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
      <div className="flex w-full flex-col gap-8 px-(--page-x) pt-2 pb-16">
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
                {data.tests.length > 0 && (
                  <Section
                    title="Split tests"
                    description="Replies come from people who answered after that email. Opens are not tracked."
                  >
                    <SplitTests id={id} tests={data.tests} />
                  </Section>
                )}
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
