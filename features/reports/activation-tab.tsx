"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import EmptyState from "@/components/_ui/empty-state";
import type { Period } from "@/convex/lib/reports";
import {
  ACTIVATION_STAGES,
  ACTIVATION_STEP_LABEL,
} from "@/lib/domain/platform";
import { cn } from "@/lib/utils";
import ActivityIcon from "@/public/assets/icons/activity.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ActivationChart from "./activation-section";
import ExportButton from "./export-button";
import { activationCsv, csvFilename } from "./export";
import { count, percent, rate, weekLabel } from "./format";
import { ChartSkeleton, Panel, Reloading, ReportSection } from "./section";
import { useLatest } from "./use-report";

type ActivationData = FunctionReturnType<typeof api.reports.activation>;

const SHORT_STEP: Record<(typeof ACTIVATION_STAGES)[number], string> = {
  signed_up: "Signed up",
  org_created: "Org created",
  funded: "Funded",
  live: "Live",
  activated: "Activated",
};

/** Heat from 0 to 1 as a wash of a status colour, so the grid reads at a glance in both themes. */
function heat(colour: "success" | "warning", value: number) {
  if (value <= 0) return undefined;
  const strength = Math.round(10 + value * 30);
  return {
    backgroundColor: `color-mix(in srgb, var(--${colour}) ${strength}%, transparent)`,
  };
}

/** Phones show the latest weeks only, so the grid fits without scrolling. */
const MOBILE_WEEKS = 3;

const CELL = "px-1.5 py-1 text-right tabular-nums";
const CHIP = "inline-flex min-w-9 justify-end rounded-md px-2 py-1.5";
const HEAD =
  "caption-style text-fg-tertiary px-3.5 py-2.5 text-right font-normal whitespace-nowrap";
const STICKY = "bg-background sticky left-0 z-1";

function StallGrid({ data }: { data: ActivationData }) {
  const labels = new Map<string, string>(
    data.rules.map((rule) => [rule.id, rule.label]),
  );
  const rows = data.stalls.filter((row) => row.total > 0 || row.open > 0);
  const most = Math.max(1, ...rows.flatMap((row) => row.counts));
  const older = (index: number) => index < data.weeks.length - MOBILE_WEEKS;
  if (rows.length === 0) {
    return (
      <EmptyState
        className="mx-auto max-w-lg"
        icon={CheckCircleIcon}
        title="No stalls in these weeks"
        description="When a brand gets stuck on the activation path, the CRM opens a task for its owner. Those tasks are counted here by rule and week."
        action={
          <Button variant="secondary" size="sm" href="/activation">
            Open activation
          </Button>
        }
      />
    );
  }
  return (
    <div className="relative overflow-x-auto">
      <table className="lead-style w-full border-collapse">
        <caption className="sr-only">
          Stall tasks opened per rule per week, and open now
        </caption>
        <thead>
          <tr className="border-border border-b">
            <th scope="col" className={cn(HEAD, STICKY, "text-left")}>
              Rule
            </th>
            {data.weeks.map((week, index) => (
              <th
                key={week}
                scope="col"
                className={cn(HEAD, older(index) && "max-sm:hidden")}
              >
                {weekLabel(week)}
              </th>
            ))}
            <th scope="col" className={HEAD}>
              Total
            </th>
            <th scope="col" className={HEAD}>
              Open now
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.ruleId}
              className="border-border border-b last:border-0"
            >
              <th
                scope="row"
                className={cn(STICKY, "px-3.5 py-1 text-left font-normal")}
              >
                <Link
                  href={`/activation?view=stuck&stall=${row.ruleId}`}
                  className="hover:text-foreground decoration-fg-tertiary/60 hover:decoration-fg-secondary focus-visible:ring-ring rounded-sm whitespace-nowrap underline decoration-dotted underline-offset-4 outline-none focus-visible:ring-2"
                >
                  {labels.get(row.ruleId) ?? row.ruleId}
                </Link>
              </th>
              {row.counts.map((value, index) => (
                <td
                  key={data.weeks[index]}
                  className={cn(
                    CELL,
                    value === 0 && "text-fg-tertiary",
                    older(index) && "max-sm:hidden",
                  )}
                >
                  <span className={CHIP} style={heat("warning", value / most)}>
                    {value === 0 ? "·" : count(value)}
                    {value === 0 && <span className="sr-only">0</span>}
                  </span>
                </td>
              ))}
              <td className={cn(CELL, "pr-3.5 font-medium")}>
                {count(row.total)}
              </td>
              <td
                className={cn(CELL, "pr-3.5", row.open > 0 && "text-warning")}
              >
                {count(row.open)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CohortGrid({ data }: { data: ActivationData }) {
  const rows = [...data.cohorts].reverse();
  return (
    <div className="relative overflow-x-auto">
      <table className="lead-style w-full border-collapse">
        <caption className="sr-only">
          Share of each signup week&apos;s brands that reached each activation
          step
        </caption>
        <thead>
          <tr className="border-border border-b">
            <th scope="col" className={cn(HEAD, STICKY, "text-left")}>
              Signup week
            </th>
            <th scope="col" className={HEAD}>
              Brands
            </th>
            {ACTIVATION_STAGES.map((stage) => (
              <th
                key={stage}
                scope="col"
                className={HEAD}
                title={ACTIVATION_STEP_LABEL[stage]}
              >
                {SHORT_STEP[stage]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.weekStart}
              className="border-border border-b last:border-0"
            >
              <th
                scope="row"
                className={cn(
                  STICKY,
                  "px-3.5 py-1 text-left font-normal whitespace-nowrap tabular-nums",
                )}
              >
                {weekLabel(row.weekStart)}
              </th>
              <td
                className={cn(
                  CELL,
                  "pr-3.5",
                  row.size === 0 && "text-fg-tertiary",
                )}
              >
                {count(row.size)}
              </td>
              {row.reached.map((reached, index) => {
                const share = rate(reached, row.size);
                return (
                  <td
                    key={ACTIVATION_STAGES[index]}
                    className={cn(CELL, share === null && "text-fg-tertiary")}
                    title={
                      share === null
                        ? undefined
                        : `${count(reached)} of ${count(row.size)}`
                    }
                  >
                    <span
                      className={cn(CHIP, "min-w-14")}
                      style={heat("success", share ?? 0)}
                    >
                      {percent(share)}
                      {share !== null && (
                        <span className="sr-only">
                          , {count(reached)} of {count(row.size)}
                        </span>
                      )}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Activation timings for the period, stall tasks by week and signup cohorts. */
export default function ActivationTab({ period }: { period: Period }) {
  const { data, loading } = useLatest(
    useQuery(api.reports.activation, { period }),
  );

  return (
    <Reloading loading={loading && Boolean(data)}>
      <ReportSection
        id="steps"
        title="Time between steps"
        description="Median and p90 time between platform milestones, for brands that completed each step in the period."
        aside={
          <ExportButton
            label="time between steps"
            filename={csvFilename("activation-steps", period)}
            disabled={!data?.hasPlatformEvents}
            rows={() => activationCsv.steps(data!)}
          />
        }
        footnote="Each step is timed from the first event of one milestone to the first of the next: signup, organisation created (GST is verified as it's created), first top-up or bank deposit, first campaign live, first approved creator result. Waiting counts brands that reached the first milestone and not the next, as of now. p90: 9 in 10 brands were at least this fast."
      >
        <Panel>
          {!data ? (
            <ChartSkeleton rows={4} />
          ) : !data.hasPlatformEvents ? (
            <EmptyState
              className="mx-auto max-w-lg"
              icon={ActivityIcon}
              title="No platform events yet"
              description="Hypedrive sends signup, organisation, funding, campaign and approval events to the CRM. Once brands move through those steps, the time each one takes shows here."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  href="/settings/integrations"
                >
                  Check the platform connection
                </Button>
              }
            />
          ) : (
            <ActivationChart
              activation={data.steps}
              previous={data.previousSteps}
            />
          )}
        </Panel>
      </ReportSection>

      <ReportSection
        id="cohorts"
        title="Signup cohorts"
        description="Brands by the week they signed up, and the share that has reached each step since."
        aside={
          <ExportButton
            label="signup cohorts"
            filename={csvFilename("cohorts", "8w")}
            disabled={!data}
            rows={() => activationCsv.cohorts(data!)}
          />
        }
        footnote="Weeks start on Monday (IST). A brand counts at every step up to the furthest it has reached. A signup that hasn't created an organisation counts as signed up only; an organisation with no signup event is dated by its first milestone. Recent weeks have had less time to move. The period filter doesn't apply."
      >
        <Panel>
          {!data ? <ChartSkeleton rows={8} /> : <CohortGrid data={data} />}
        </Panel>
      </ReportSection>

      <ReportSection
        id="stalls"
        title="Stalls by week"
        description="Activation tasks opened per rule each week. Select a rule to see who is stuck on it now."
        aside={
          <ExportButton
            label="stalls by week"
            filename={csvFilename("stalls", "8w")}
            disabled={!data}
            rows={() => activationCsv.stalls(data!)}
          />
        }
        footnote="Counted when the CRM opens a stall task for a brand's owner; a task reopened for the same brand and rule counts in the week it was first opened. Open now: those tasks not yet done. The period filter doesn't apply."
      >
        <Panel>
          {!data ? <ChartSkeleton rows={4} /> : <StallGrid data={data} />}
        </Panel>
      </ReportSection>
    </Reloading>
  );
}
