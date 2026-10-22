"use client";

import OptionPicker, { type Option } from "@/components/fields/option-picker";
import {
  AGENT_EVENTS,
  EVENT_LABEL,
  hourLabel,
  weekdayName,
  type AgentEvent,
  type AgentTrigger,
  type Frequency,
} from "@/lib/domain/agents";

type When = Frequency | AgentEvent | "manual";

const WHEN: Option[] = [
  { value: "weekdays", label: "Every weekday" },
  { value: "daily", label: "Every day" },
  { value: "weekly", label: "Every week" },
  ...AGENT_EVENTS.map((event) => ({
    value: event,
    label: EVENT_LABEL[event],
  })),
  { value: "manual", label: "Only when I run it" },
];

const HOURS: Option[] = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: hourLabel(hour),
}));

const DAYS: Option[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
  value: String(day),
  label: weekdayName(day),
}));

export const DEFAULT_TRIGGER: AgentTrigger = {
  kind: "schedule",
  every: "weekly",
  hour: 9,
  weekday: 1,
};

const whenOf = (trigger: AgentTrigger): When =>
  trigger.kind === "schedule"
    ? trigger.every
    : trigger.kind === "event"
      ? trigger.event
      : "manual";

function triggerFor(when: When, previous: AgentTrigger): AgentTrigger {
  if (when === "manual") return { kind: "manual" };
  if ((AGENT_EVENTS as readonly string[]).includes(when)) {
    return { kind: "event", event: when as AgentEvent };
  }
  const hour = previous.kind === "schedule" ? previous.hour : 9;
  const weekday = previous.kind === "schedule" ? previous.weekday : undefined;
  return {
    kind: "schedule",
    every: when as Frequency,
    hour,
    weekday: when === "weekly" ? (weekday ?? 1) : undefined,
  };
}

export default function TriggerPicker({
  value,
  onChange,
  className,
}: {
  value: AgentTrigger;
  onChange: (value: AgentTrigger) => void;
  className?: string;
}) {
  return (
    <>
      <OptionPicker
        label="Runs"
        value={whenOf(value)}
        options={WHEN}
        onChange={(next) =>
          onChange(triggerFor((next ?? "manual") as When, value))
        }
        className={className}
      />
      {value.kind === "schedule" && (
        <>
          {value.every === "weekly" && (
            <OptionPicker
              label="Day"
              value={String(value.weekday ?? 1)}
              options={DAYS}
              onChange={(next) =>
                onChange({ ...value, weekday: Number(next ?? 1) })
              }
              className={className}
            />
          )}
          <OptionPicker
            label="Time (India)"
            value={String(value.hour)}
            options={HOURS}
            onChange={(next) => onChange({ ...value, hour: Number(next ?? 9) })}
            className={className}
          />
        </>
      )}
    </>
  );
}
