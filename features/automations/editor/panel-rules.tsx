"use client";

import { useEffect, useId, useRef, useState } from "react";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import SegmentedControl from "@/components/_ui/segmented-control";
import SelectField from "@/components/_ui/select-field";
import { Switch } from "@/components/_ui/switch";
import {
  CONSENT_PURPOSE_LABEL,
  type ConsentPurpose,
} from "@/lib/domain/consent";
import {
  DEAL_STAGES,
  LEAD_KINDS,
  LEAD_STATUSES,
  LIFECYCLE_STAGES,
} from "@/lib/domain/enums";
import {
  DEAL_STAGE_LABEL,
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
  STAGE_LABEL,
} from "@/lib/domain/labels";
import { LEAD_SOURCE_LABEL } from "@/lib/domain/leads";
import {
  CAMPAIGN_STATUS_OPTIONS,
  LIMITS,
  OPS_FOR,
  OP_LABEL,
  PAUSE_REASON_OPTIONS,
  REPLY_CHANNELS,
  REPLY_CHANNEL_LABEL,
  TRIGGER_KINDS,
  TRIGGER_LABEL,
  TRIGGER_SUBJECTS,
  conditionFields,
  configOf,
  platformEventOptions,
  type Condition,
  type ConditionConfig,
  type ConditionOp,
  type GraphNode,
  type SubjectKind,
  type Trigger,
  type TriggerKind,
} from "@/lib/domain/automations";
import { useEditor } from "./editor-context";
import { useEditorStore } from "./editor-store";
import { ChoicePills, NumberInput, PanelSection, ToggleRow } from "./form-bits";

const opts = <T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
) => values.map((value) => ({ value, label: labels[value] }));

/** Guards and filters: who enrols, when a step may act, and when a run ends. */
export default function PanelRules({
  node,
  fieldErrors,
}: {
  node: GraphNode;
  fieldErrors: Record<string, string>;
}) {
  const { automation, readOnly, setTrigger } = useEditor();
  const updateConfig = useEditorStore((state) => state.updateConfig);
  const checkpoint = useEditorStore((state) => state.checkpoint);
  const id = useId();

  switch (node.kind) {
    case "trigger":
      return (
        <div className="flex flex-col gap-7">
          <PanelSection
            title="Who enrols"
            description={`${TRIGGER_LABEL[automation.trigger.kind]}. Leave a filter empty to accept any.`}
          >
            <TriggerFilters
              trigger={automation.trigger}
              onChange={setTrigger}
              disabled={readOnly}
              errors={fieldErrors}
            />
          </PanelSection>
          <AutomationRules />
        </div>
      );
    case "wait": {
      const config = configOf(node, "wait");
      if (config.mode !== "event") {
        return (
          <p className="caption-style text-fg-tertiary leading-snug">
            Timed waits have no extra rules. Choose “Until something happens” in
            Build to wait for an event.
          </p>
        );
      }
      const event = config.event ?? { kind: "lead_status_changed" as const };
      const kinds = TRIGGER_KINDS.filter(
        (kind) =>
          kind !== "manual" &&
          TRIGGER_SUBJECTS[kind].includes(automation.subjectKind),
      );
      return (
        <div className="flex flex-col gap-5" onFocusCapture={checkpoint}>
          <Field label="Wait for" htmlFor={`${id}-event`}>
            <SelectField<TriggerKind>
              id={`${id}-event`}
              value={event.kind}
              disabled={readOnly}
              options={kinds.map((kind) => ({
                value: kind,
                label: TRIGGER_LABEL[kind],
              }))}
              onChange={(kind) => updateConfig(node.id, { event: { kind } })}
            />
          </Field>
          <TriggerFilters
            trigger={event}
            disabled={readOnly}
            errors={fieldErrors}
            onChange={(next) => updateConfig(node.id, { event: next })}
          />
        </div>
      );
    }
    case "condition": {
      const config = configOf(node, "condition");
      return (
        <div onFocusCapture={checkpoint}>
          <ConditionsEditor
            value={config}
            subject={automation.subjectKind}
            disabled={readOnly}
            error={fieldErrors.conditions}
            onChange={(next) => updateConfig(node.id, next)}
          />
        </div>
      );
    }
    case "send_email":
    case "send_whatsapp": {
      const purpose =
        (node.config.purpose as ConsentPurpose) ?? "sales_outreach";
      return (
        <div className="flex flex-col gap-5">
          <Field
            label="Purpose"
            htmlFor={`${id}-purpose`}
            hint="Checked against the person's consent for this channel and purpose right before sending. Without it, the step is skipped and logged."
          >
            <SelectField<ConsentPurpose>
              id={`${id}-purpose`}
              value={purpose}
              disabled={readOnly}
              options={opts(
                ["sales_outreach", "product_updates"] as const,
                CONSENT_PURPOSE_LABEL,
              )}
              onChange={(value) => updateConfig(node.id, { purpose: value })}
            />
          </Field>
          <ul className="caption-style text-fg-secondary flex flex-col gap-2 leading-snug">
            <li>
              <span className="text-foreground font-medium">Quiet hours.</span>{" "}
              {automation.settings.quietHours
                ? "Held until 9:00–20:00 India time."
                : "Off for this automation."}
            </li>
            <li>
              <span className="text-foreground font-medium">Daily cap.</span> At
              most {automation.settings.dailyCap} messages a day across this
              automation; the rest wait for tomorrow.
            </li>
            <li>
              <span className="text-foreground font-medium">
                Frequency cap.
              </span>{" "}
              Held while the person already got the workspace’s limit of
              automated messages in the last 7 days, across all automations.
            </li>
            <li>
              <span className="text-foreground font-medium">
                Empty variables.
              </span>{" "}
              Skipped when a variable without a fallback has no value.
            </li>
            <li>
              <span className="text-foreground font-medium">Once per run.</span>{" "}
              A retry never sends twice.
            </li>
          </ul>
        </div>
      );
    }
    default:
      return (
        <p className="caption-style text-fg-tertiary leading-snug">
          This step has no rules of its own. The automation’s exit rules, set on
          the trigger, still apply before it runs.
        </p>
      );
  }
}

function TriggerFilters({
  trigger,
  onChange,
  disabled,
  errors,
}: {
  trigger: Trigger;
  onChange: (trigger: Trigger) => void;
  disabled: boolean;
  errors: Record<string, string>;
}) {
  const { catalog } = useEditor();
  const id = useId();
  const set = (patch: Partial<Trigger>) => onChange({ ...trigger, ...patch });
  const pills = (
    key: keyof Trigger,
    label: string,
    options: { value: string; label: string }[],
  ) => (
    <Field label={label} htmlFor={`${id}-${key}`} error={errors[key]}>
      <ChoicePills
        label={label}
        anyLabel="Any"
        disabled={disabled}
        value={(trigger[key] as string[] | undefined) ?? []}
        options={options}
        onChange={(value) => set({ [key]: value.length ? value : undefined })}
      />
    </Field>
  );
  switch (trigger.kind) {
    case "lead_created":
      return (
        <div className="flex flex-col gap-4">
          {pills("leadKinds", "Kind", opts(LEAD_KINDS, LEAD_KIND_LABEL))}
          {pills(
            "leadSources",
            "Source",
            Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => ({
              value,
              label,
            })),
          )}
        </div>
      );
    case "lead_status_changed":
      return pills(
        "leadStatuses",
        "Moves to",
        opts(LEAD_STATUSES, LEAD_STATUS_LABEL),
      );
    case "deal_stage_changed":
      return pills(
        "dealStages",
        "Moves to",
        opts(DEAL_STAGES, DEAL_STAGE_LABEL),
      );
    case "account_stage_changed":
      return pills(
        "accountStages",
        "Moves to",
        opts(LIFECYCLE_STAGES, STAGE_LABEL),
      );
    case "platform_event":
      return (
        <div className="flex flex-col gap-4">
          <Field
            label="Event"
            htmlFor={`${id}-events`}
            error={errors.eventTypes}
          >
            <ChoicePills
              label="Event"
              disabled={disabled}
              value={trigger.eventTypes ?? []}
              options={platformEventOptions()}
              onChange={(eventTypes) =>
                set({
                  eventTypes,
                  ...(eventTypes.includes("campaign.status_changed")
                    ? {}
                    : { campaignStatuses: undefined, pauseReasons: undefined }),
                })
              }
            />
          </Field>
          {trigger.eventTypes?.includes("campaign.status_changed") && (
            <>
              {pills(
                "campaignStatuses",
                "Campaign moves to",
                CAMPAIGN_STATUS_OPTIONS,
              )}
              {(!trigger.campaignStatuses?.length ||
                trigger.campaignStatuses.includes("paused")) &&
                pills("pauseReasons", "Paused because", PAUSE_REASON_OPTIONS)}
            </>
          )}
        </div>
      );
    case "stall_started":
      return pills(
        "ruleIds",
        "Stuck at",
        (catalog?.stallRules ?? []).map((rule) => ({
          value: rule.id,
          label: rule.label,
        })),
      );
    case "task_completed":
      return (
        <p className="caption-style text-fg-tertiary leading-snug">
          Any task on the record that a teammate marks done.
        </p>
      );
    case "reply_received":
      return pills(
        "channels",
        "Replied on",
        opts(REPLY_CHANNELS, REPLY_CHANNEL_LABEL),
      );
    case "manual":
      return (
        <p className="caption-style text-fg-tertiary leading-snug">
          Teammates add records with “Add to automation” on a list’s selection
          bar or a record’s Automations tab.
        </p>
      );
  }
}

const MEMBER_FIELD = "owner";

export function ConditionsEditor({
  value,
  onChange,
  subject,
  disabled,
  error,
  emptyLabel = "Add a condition",
}: {
  value: ConditionConfig;
  onChange: (value: ConditionConfig) => void;
  subject: SubjectKind;
  disabled: boolean;
  error?: string;
  emptyLabel?: string;
}) {
  const { catalog } = useEditor();
  const fields = conditionFields().filter((field) =>
    field.subjects.includes(subject),
  );
  const conditions = value.conditions ?? [];
  const setAt = (index: number, patch: Partial<Condition>) =>
    onChange({
      ...value,
      conditions: conditions.map((item, at) =>
        at === index ? { ...item, ...patch } : item,
      ),
    });
  const add = () => {
    const field = fields[0];
    onChange({
      ...value,
      conditions: [
        ...conditions,
        { field: field.key, op: OPS_FOR[field.type][0] },
      ],
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {conditions.length > 1 && (
        <SegmentedControl
          label="Match"
          value={value.match}
          onChange={(match) =>
            onChange({ ...value, match: match as "all" | "any" })
          }
          segments={[
            { value: "all", label: "Match all" },
            { value: "any", label: "Match any" },
          ]}
          className="self-start"
        />
      )}
      {conditions.map((condition, index) => {
        const field =
          fields.find((item) => item.key === condition.field) ?? fields[0];
        const ops = OPS_FOR[field.type];
        const needsValue =
          condition.op !== "is_true" && condition.op !== "is_false";
        return (
          <div
            key={index}
            className="bg-overlay-1 border-border flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-fg-tertiary w-10 shrink-0 text-xs">
                {index === 0 ? "If" : value.match === "any" ? "or" : "and"}
              </span>
              <SelectField
                aria-label="Field"
                value={field.key}
                disabled={disabled}
                options={fields.map((item) => ({
                  value: item.key,
                  label: item.label,
                }))}
                onChange={(key) => {
                  const next = fields.find((item) => item.key === key)!;
                  setAt(index, {
                    field: key,
                    op: OPS_FOR[next.type][0],
                    value: undefined,
                  });
                }}
                className="h-8 min-w-0 flex-1"
              />
              {!disabled && (
                <button
                  type="button"
                  aria-label="Remove condition"
                  onClick={() =>
                    onChange({
                      ...value,
                      conditions: conditions.filter((_, at) => at !== index),
                    })
                  }
                  className="text-fg-tertiary hover:text-foreground hover:bg-overlay-2 focus-visible:ring-ring rounded-md px-1.5 py-1 text-xs outline-none focus-visible:ring-2"
                >
                  Remove
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2 pl-12">
              <SelectField<ConditionOp>
                aria-label="Comparison"
                value={condition.op}
                disabled={disabled}
                options={ops.map((op) => ({ value: op, label: OP_LABEL[op] }))}
                onChange={(op) => setAt(index, { op })}
                className="h-8"
              />
              {needsValue &&
                (field.options ? (
                  <ChoicePills
                    label={`${field.label} values`}
                    disabled={disabled}
                    single={condition.op === "reached"}
                    value={condition.value ?? []}
                    options={field.options}
                    onChange={(next) => setAt(index, { value: next })}
                  />
                ) : field.key === MEMBER_FIELD ? (
                  <SelectField
                    aria-label="Teammate"
                    value={condition.value?.[0]}
                    disabled={disabled}
                    placeholder="Pick a teammate"
                    options={(catalog?.members ?? []).map((member) => ({
                      value: member._id,
                      label: member.name,
                    }))}
                    onChange={(member) => setAt(index, { value: [member] })}
                    className="h-8"
                  />
                ) : field.type === "number" ? (
                  <NumberInput
                    aria-label={field.label}
                    value={
                      condition.value?.[0] === undefined
                        ? undefined
                        : Number(condition.value[0])
                    }
                    disabled={disabled}
                    onChange={(number) =>
                      setAt(index, { value: [String(number)] })
                    }
                    className="h-8"
                  />
                ) : (
                  <Input
                    aria-label={field.label}
                    value={(condition.value ?? []).join(", ")}
                    disabled={disabled}
                    placeholder={
                      field.type === "tags" ? "Tags, comma separated" : "Value"
                    }
                    onChange={(event) =>
                      setAt(index, {
                        value: event.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                    className="h-8"
                  />
                ))}
            </div>
          </div>
        );
      })}
      {!disabled && conditions.length < LIMITS.conditions && (
        <button
          type="button"
          onClick={add}
          className="text-fg-secondary hover:text-foreground focus-visible:ring-ring self-start rounded-md text-xs font-medium outline-none focus-visible:ring-2"
        >
          + {conditions.length ? "Add another" : emptyLabel}
        </button>
      )}
      {error && <p className="caption-style text-danger">{error}</p>}
    </div>
  );
}

const SAVE_DELAY = 400;

function AutomationRules() {
  const { automation, readOnly, setSettings } = useEditor();
  const settings = automation.settings;
  const [goal, setGoal] = useState(settings.goal);
  const [cap, setCap] = useState(settings.dailyCap);
  const latest = useRef(settings);
  useEffect(() => {
    latest.current = settings;
  }, [settings]);
  const serverGoal = JSON.stringify(settings.goal);
  const edited = useRef(false);

  useEffect(() => {
    if (!edited.current) return;
    const timer = window.setTimeout(() => {
      edited.current = false;
      setSettings({ ...latest.current, goal, dailyCap: cap });
    }, SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [goal, cap, setSettings]);

  useEffect(() => {
    if (edited.current) return;
    setGoal(JSON.parse(serverGoal));
  }, [serverGoal]);

  return (
    <>
      <PanelSection
        title="Goal"
        description="A run ends as soon as the record meets all of these, before any further step."
      >
        <ConditionsEditor
          value={{ match: "all", conditions: goal }}
          subject={automation.subjectKind}
          disabled={readOnly}
          emptyLabel="Add a goal"
          onChange={(next) => {
            edited.current = true;
            setGoal(next.conditions);
          }}
        />
      </PanelSection>
      <PanelSection title="Exit and limits">
        <ToggleRow
          label="Stop when they engage"
          description="Exit when they reply by email or WhatsApp, or a teammate logs an email, WhatsApp, call or meeting on the record after it enrolled."
          control={(controlId) => (
            <Switch
              id={controlId}
              checked={settings.stopOnReply}
              disabled={readOnly}
              onCheckedChange={(stopOnReply) =>
                setSettings({ ...settings, stopOnReply })
              }
            />
          )}
        />
        <ToggleRow
          label="Quiet hours"
          description="Hold emails and WhatsApp messages to 9:00–20:00 India time."
          control={(controlId) => (
            <Switch
              id={controlId}
              checked={settings.quietHours}
              disabled={readOnly}
              onCheckedChange={(quietHours) =>
                setSettings({ ...settings, quietHours })
              }
            />
          )}
        />
        <ToggleRow
          label="Allow re-enrolment"
          description="Let a record go through again after its last run ended."
          control={(controlId) => (
            <Switch
              id={controlId}
              checked={settings.allowReenroll}
              disabled={readOnly}
              onCheckedChange={(allowReenroll) =>
                setSettings({ ...settings, allowReenroll })
              }
            />
          )}
        />
        <ToggleRow
          label="Daily send cap"
          description="Outbound messages a day across all runs."
          control={(controlId) => (
            <NumberInput
              id={controlId}
              min={LIMITS.dailyCap.min}
              max={LIMITS.dailyCap.max}
              value={cap}
              disabled={readOnly}
              onChange={(value) => {
                edited.current = true;
                setCap(value);
              }}
              className="h-8 w-20 text-right"
            />
          )}
        />
      </PanelSection>
    </>
  );
}
