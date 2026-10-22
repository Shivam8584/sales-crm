"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import FilterMenu from "@/components/_common/filter-menu";
import { Input } from "@/components/_ui/input";
import {
  formatFigure,
  goalText,
  monthLabel,
  monthName,
  parseGoal,
} from "@/features/targets/format";
import { useMembers } from "@/hooks/use-viewer";
import {
  TARGET_METRICS,
  TARGET_METRIC_LABEL,
  currentPeriod,
  shiftPeriod,
  type TargetMetric,
} from "@/lib/domain/forecast";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import {
  AdminOnly,
  SettingsIntro,
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
} from "./settings-ui";

const UNIT: Record<TargetMetric, string> = {
  won_take: "Monthly take on deals closed won, in rupees.",
  activations: "Accounts that went live for the first time this month.",
  new_leads_converted: "Leads converted into accounts this month.",
  calls_logged: "Calls and meetings logged by hand this month.",
};

/** /settings/targets: the monthly goals the Today strip and the forecast measure against. */
export default function TargetsSettings() {
  const [period, setPeriod] = useState(() => currentPeriod());
  const members = useMembers();
  const rows = useQuery(api.targets.list, { period });
  const months = [-3, -2, -1, 0, 1, 2].map((by) =>
    shiftPeriod(currentPeriod(), by),
  );

  return (
    <AdminOnly>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <SettingsIntro>
          Monthly goals. Reps see their pace on Today.
        </SettingsIntro>
        <FilterMenu
          label="Month"
          value={period}
          onChange={setPeriod}
          options={months.map((value) => ({
            value,
            label: monthLabel(value),
          }))}
          align="end"
        />
      </div>
      {rows === undefined || members === undefined ? (
        TARGET_METRICS.map((metric) => (
          <SettingsSkeleton key={metric} rows={3} />
        ))
      ) : (
        <>
          {rows.length === 0 && (
            <div className="flex items-center gap-3">
              <p className="caption-style text-fg-tertiary">
                No targets set for {monthName(period)}.
              </p>
              <Button
                variant="secondary"
                size="xs"
                onClick={() =>
                  document
                    .querySelector<HTMLInputElement>("input[aria-label^=Team]")
                    ?.focus()
                }
              >
                Set a goal
              </Button>
            </div>
          )}
          {TARGET_METRICS.map((metric) => (
            <SettingsSection
              key={metric}
              title={TARGET_METRIC_LABEL[metric]}
              description={UNIT[metric]}
            >
              {[{ _id: "team" as const, name: "Team" }, ...members].map(
                (who) => {
                  const value =
                    rows.find(
                      (row) => row.scope === who._id && row.metric === metric,
                    )?.value ?? null;
                  return (
                    <SettingsRow key={who._id} label={who.name}>
                      <GoalInput
                        key={`${period}:${value}`}
                        period={period}
                        scope={who._id}
                        name={who.name}
                        metric={metric}
                        value={value}
                      />
                    </SettingsRow>
                  );
                },
              )}
            </SettingsSection>
          ))}
        </>
      )}
    </AdminOnly>
  );
}

function GoalInput({
  period,
  scope,
  name,
  metric,
  value,
}: {
  period: string;
  scope: "team" | Id<"members">;
  name: string;
  metric: TargetMetric;
  value: number | null;
}) {
  const set = useMutation(api.targets.set);
  const [text, setText] = useState(goalText(metric, value));
  const label = `${name} ${TARGET_METRIC_LABEL[metric].toLowerCase()} goal`;

  async function save(next: number | null, undoing = false) {
    try {
      const { previous } = await set({ period, scope, metric, value: next });
      toast(
        undoing
          ? "Goal restored"
          : next === null
            ? `Cleared ${label}`
            : `${label} set to ${formatFigure(metric, next)}`,
        undoing ? undefined : { undo: () => void save(previous, true) },
      );
    } catch (error) {
      setText(goalText(metric, value));
      toast(readError(error, "Couldn't save the goal").message, {
        tone: "danger",
      });
    }
  }

  function commit() {
    const next = parseGoal(metric, text);
    if (next === undefined) {
      setText(goalText(metric, value));
      return toast(
        metric === "won_take"
          ? "Enter an amount in rupees, zero or more"
          : "Enter a whole number, zero or more",
        { tone: "warning" },
      );
    }
    if (next === value) return setText(goalText(metric, value));
    void save(next);
  }

  return (
    <Input
      inputMode="decimal"
      aria-label={label}
      placeholder="No goal"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
      className="w-32 text-right tabular-nums"
    />
  );
}
