"use client";

import { useId } from "react";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import SelectField from "@/components/_ui/select-field";
import {
  ASSIGNEES,
  SUBJECT_KINDS,
  SUBJECT_LABEL,
  TRIGGER_KINDS,
  TRIGGER_LABEL,
  TRIGGER_SUBJECTS,
  UPDATE_FIELD_LABEL,
  WAIT_UNITS,
  WEEKDAY_LABEL,
  configOf,
  updateFieldsFor,
  updateValues,
  type Assignee,
  type GraphNode,
  type SubjectKind,
  type TriggerKind,
  type UpdateField,
  type WaitMode,
  type WaitUnit,
} from "@/lib/domain/automations";
import { PRIORITIES, type Priority } from "@/lib/domain/enums";
import { PRIORITY_LABEL } from "@/lib/domain/labels";
import { useEditor } from "./editor-context";
import { useEditorStore } from "./editor-store";
import {
  ChoicePills,
  NumberInput,
  PanelSection,
  TemplateInput,
} from "./form-bits";
import TemplatePreview from "./template-preview";

const ASSIGNEE_LABEL: Record<Assignee, string> = {
  owner: "Record owner",
  round_robin: "Round-robin",
  member: "A teammate",
};

const WAIT_MODE_LABEL: Record<WaitMode, string> = {
  duration: "For a while",
  until: "Until a day and time",
  event: "Until something happens",
};

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const unitOptions = WAIT_UNITS.map((unit) => ({
  value: unit,
  label: capital(unit),
}));

/** What the step does: its name and main settings. */
export default function PanelBuild({
  node,
  fieldErrors,
}: {
  node: GraphNode;
  fieldErrors: Record<string, string>;
}) {
  const { readOnly } = useEditor();
  const updateNode = useEditorStore((state) => state.updateNode);
  const checkpoint = useEditorStore((state) => state.checkpoint);
  const id = useId();

  return (
    <div className="flex flex-col gap-6" onFocusCapture={checkpoint}>
      {node.kind !== "trigger" && (
        <Field
          label="Step name"
          htmlFor={`${id}-title`}
          hint="Optional; shown on the canvas instead of the summary."
        >
          <Input
            id={`${id}-title`}
            value={node.title ?? ""}
            disabled={readOnly}
            maxLength={120}
            placeholder="Name this step"
            onChange={(event) =>
              updateNode(node.id, { title: event.target.value || undefined })
            }
          />
        </Field>
      )}
      <BuildFields node={node} fieldErrors={fieldErrors} />
    </div>
  );
}

function BuildFields({
  node,
  fieldErrors,
}: {
  node: GraphNode;
  fieldErrors: Record<string, string>;
}) {
  const { automation, catalog, readOnly, setTrigger, setSubjectKind } =
    useEditor();
  const updateConfig = useEditorStore((state) => state.updateConfig);
  const id = useId();
  const set = (patch: Record<string, unknown>) => updateConfig(node.id, patch);
  const members = (catalog?.members ?? []).map((member) => ({
    value: member._id,
    label: member.name,
  }));
  const subject = automation.subjectKind;

  switch (node.kind) {
    case "trigger": {
      const trigger = automation.trigger;
      return (
        <>
          <Field label="Starts when" htmlFor={`${id}-trigger`}>
            <SelectField<TriggerKind>
              id={`${id}-trigger`}
              value={trigger.kind}
              disabled={readOnly}
              options={TRIGGER_KINDS.map((kind) => ({
                value: kind,
                label: TRIGGER_LABEL[kind],
              }))}
              onChange={(kind) => {
                setTrigger({ kind });
                if (!TRIGGER_SUBJECTS[kind].includes(subject))
                  setSubjectKind(TRIGGER_SUBJECTS[kind][0]);
              }}
            />
          </Field>
          <Field
            label="Enrols"
            htmlFor={`${id}-subject`}
            hint="The record that moves through the steps. Messages go to its main contact."
            error={fieldErrors.subjectKind}
          >
            <SelectField<SubjectKind>
              id={`${id}-subject`}
              value={subject}
              disabled={readOnly}
              options={SUBJECT_KINDS.map((kind) => ({
                value: kind,
                label: capital(SUBJECT_LABEL[kind][1]),
                disabled: !TRIGGER_SUBJECTS[trigger.kind].includes(kind),
              }))}
              onChange={setSubjectKind}
            />
          </Field>
          <p className="caption-style text-fg-tertiary leading-snug">
            Narrow who enrols, and set when they leave, in the Rules tab.
          </p>
        </>
      );
    }
    case "wait": {
      const config = configOf(node, "wait");
      return (
        <>
          <Field label="Wait" htmlFor={`${id}-mode`}>
            <SelectField<WaitMode>
              id={`${id}-mode`}
              value={config.mode}
              disabled={readOnly}
              options={(["duration", "until", "event"] as const).map(
                (mode) => ({ value: mode, label: WAIT_MODE_LABEL[mode] }),
              )}
              onChange={(mode) =>
                set(
                  mode === "duration"
                    ? {
                        mode,
                        amount: config.amount ?? 1,
                        unit: config.unit ?? "days",
                      }
                    : mode === "until"
                      ? {
                          mode,
                          days: config.days ?? [1, 2, 3, 4, 5],
                          time: config.time ?? "10:00",
                        }
                      : {
                          mode,
                          event: config.event ?? {
                            kind: "lead_status_changed",
                          },
                          timeoutAmount: config.timeoutAmount ?? 3,
                          timeoutUnit: config.timeoutUnit ?? "days",
                        },
                )
              }
            />
          </Field>
          {config.mode === "duration" && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="For"
                htmlFor={`${id}-amount`}
                error={fieldErrors.amount}
              >
                <NumberInput
                  id={`${id}-amount`}
                  min={1}
                  value={config.amount}
                  disabled={readOnly}
                  onChange={(amount) => set({ amount })}
                />
              </Field>
              <Field label="Unit" htmlFor={`${id}-unit`}>
                <SelectField<WaitUnit>
                  id={`${id}-unit`}
                  value={config.unit ?? "days"}
                  disabled={readOnly}
                  options={unitOptions}
                  onChange={(unit) => set({ unit })}
                />
              </Field>
            </div>
          )}
          {config.mode === "until" && (
            <>
              <Field label="On" htmlFor={`${id}-days`} error={fieldErrors.days}>
                <ChoicePills
                  label="Days"
                  disabled={readOnly}
                  value={(config.days ?? []).map(String)}
                  options={WEEKDAY_LABEL.map((label, index) => ({
                    value: String(index + 1),
                    label,
                  }))}
                  onChange={(days) => set({ days: days.map(Number).sort() })}
                />
              </Field>
              <Field
                label="At (India time)"
                htmlFor={`${id}-time`}
                error={fieldErrors.time}
              >
                <Input
                  id={`${id}-time`}
                  type="time"
                  value={config.time ?? ""}
                  disabled={readOnly}
                  onChange={(event) => set({ time: event.target.value })}
                />
              </Field>
            </>
          )}
          {config.mode === "event" && (
            <>
              <p className="caption-style text-fg-tertiary leading-snug">
                Takes the EVENT path as soon as it happens, or TIMEOUT after the
                limit. Pick the event in the Rules tab.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Give up after"
                  htmlFor={`${id}-timeout`}
                  error={fieldErrors.timeoutAmount}
                >
                  <NumberInput
                    id={`${id}-timeout`}
                    min={1}
                    value={config.timeoutAmount}
                    disabled={readOnly}
                    onChange={(timeoutAmount) => set({ timeoutAmount })}
                  />
                </Field>
                <Field label="Unit" htmlFor={`${id}-timeout-unit`}>
                  <SelectField<WaitUnit>
                    id={`${id}-timeout-unit`}
                    value={config.timeoutUnit ?? "days"}
                    disabled={readOnly}
                    options={unitOptions}
                    onChange={(timeoutUnit) => set({ timeoutUnit })}
                  />
                </Field>
              </div>
            </>
          )}
        </>
      );
    }
    case "condition":
      return (
        <p className="caption-style text-fg-tertiary leading-snug">
          Records that match go down YES, the rest down NO. Set the conditions
          in the Rules tab.
        </p>
      );
    case "create_task": {
      const config = configOf(node, "create_task");
      return (
        <>
          <Field label="Task" htmlFor={`${id}-title`} error={fieldErrors.title}>
            <TemplateInput
              id={`${id}-title`}
              value={config.title ?? ""}
              disabled={readOnly}
              invalid={Boolean(fieldErrors.title)}
              onChange={(title) => set({ title })}
            />
          </Field>
          <Field
            label="Notes"
            htmlFor={`${id}-notes`}
            error={fieldErrors.notes}
          >
            <TemplateInput
              id={`${id}-notes`}
              multiline
              rows={3}
              value={config.notes ?? ""}
              disabled={readOnly}
              onChange={(notes) => set({ notes: notes || undefined })}
            />
          </Field>
          <Field
            label="Assign to"
            htmlFor={`${id}-assignee`}
            error={fieldErrors.assignee}
          >
            <SelectField<Assignee>
              id={`${id}-assignee`}
              value={config.assignee}
              disabled={readOnly}
              options={ASSIGNEES.map((value) => ({
                value,
                label: ASSIGNEE_LABEL[value],
              }))}
              onChange={(assignee) => set({ assignee })}
            />
          </Field>
          {config.assignee === "member" && (
            <Field
              label="Teammate"
              htmlFor={`${id}-member`}
              error={fieldErrors.memberId}
            >
              <SelectField
                id={`${id}-member`}
                value={config.memberId}
                disabled={readOnly}
                options={members}
                placeholder="Pick a teammate"
                onChange={(memberId) => set({ memberId })}
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Due in (days)"
              htmlFor={`${id}-due`}
              error={fieldErrors.dueInDays}
              hint="0 is today"
            >
              <NumberInput
                id={`${id}-due`}
                min={0}
                max={365}
                value={config.dueInDays}
                disabled={readOnly}
                onChange={(dueInDays) => set({ dueInDays })}
              />
            </Field>
            <Field label="Priority" htmlFor={`${id}-priority`}>
              <SelectField<Priority>
                id={`${id}-priority`}
                value={config.priority}
                disabled={readOnly}
                options={PRIORITIES.map((value) => ({
                  value,
                  label: PRIORITY_LABEL[value],
                }))}
                onChange={(priority) => set({ priority })}
              />
            </Field>
          </div>
          <TemplatePreview node={node} />
        </>
      );
    }
    case "send_email": {
      const config = configOf(node, "send_email");
      return (
        <>
          <Field
            label="Subject"
            htmlFor={`${id}-subject`}
            error={fieldErrors.subject}
          >
            <TemplateInput
              id={`${id}-subject`}
              value={config.subject ?? ""}
              disabled={readOnly}
              invalid={Boolean(fieldErrors.subject)}
              placeholder="Quick question, {{person.firstName|there}}"
              onChange={(value) => set({ subject: value })}
            />
          </Field>
          <Field
            label="Message"
            htmlFor={`${id}-body`}
            error={fieldErrors.body}
          >
            <TemplateInput
              id={`${id}-body`}
              multiline
              rows={8}
              value={config.body ?? ""}
              disabled={readOnly}
              invalid={Boolean(fieldErrors.body)}
              onChange={(body) => set({ body })}
            />
          </Field>
          <DeliveryNote channel="email" />
          <TemplatePreview node={node} />
        </>
      );
    }
    case "send_whatsapp": {
      const config = configOf(node, "send_whatsapp");
      const params = config.params ?? [];
      return (
        <>
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field
              label="Approved template"
              htmlFor={`${id}-template`}
              error={fieldErrors.template}
            >
              <Input
                id={`${id}-template`}
                value={config.template ?? ""}
                disabled={readOnly}
                aria-invalid={Boolean(fieldErrors.template) || undefined}
                placeholder="demo_follow_up"
                className="aria-invalid:border-danger font-mono"
                onChange={(event) =>
                  set({ template: event.target.value.trim() })
                }
              />
            </Field>
            <Field
              label="Language"
              htmlFor={`${id}-language`}
              error={fieldErrors.language}
            >
              <Input
                id={`${id}-language`}
                value={config.language ?? ""}
                disabled={readOnly}
                placeholder="en"
                className="font-mono"
                onChange={(event) =>
                  set({ language: event.target.value.trim() })
                }
              />
            </Field>
          </div>
          <PanelSection
            title="Body parameters"
            description="Filled into the template's {{1}}, {{2}}… in order."
          >
            {params.map((param, index) => (
              <div key={index} className="flex items-start gap-2">
                <span className="text-fg-tertiary mt-2.5 w-8 shrink-0 font-mono text-xs">{`{{${index + 1}}}`}</span>
                <div className="min-w-0 flex-1">
                  <TemplateInput
                    id={`${id}-param-${index}`}
                    value={param}
                    disabled={readOnly}
                    onChange={(value) =>
                      set({
                        params: params.map((item, at) =>
                          at === index ? value : item,
                        ),
                      })
                    }
                  />
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    aria-label={`Remove parameter ${index + 1}`}
                    onClick={() =>
                      set({ params: params.filter((_, at) => at !== index) })
                    }
                    className="text-fg-tertiary hover:text-foreground hover:bg-overlay-2 focus-visible:ring-ring mt-1.5 rounded-md px-1.5 py-1 text-xs outline-none focus-visible:ring-2"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            {!readOnly && params.length < 10 && (
              <button
                type="button"
                onClick={() => set({ params: [...params, ""] })}
                className="text-fg-secondary hover:text-foreground focus-visible:ring-ring self-start rounded-md text-xs font-medium outline-none focus-visible:ring-2"
              >
                + Add parameter
              </button>
            )}
            {fieldErrors.params && (
              <p className="caption-style text-danger">{fieldErrors.params}</p>
            )}
          </PanelSection>
          <DeliveryNote channel="whatsapp" />
          <TemplatePreview node={node} />
        </>
      );
    }
    case "notify": {
      const config = configOf(node, "notify");
      return (
        <>
          <Field label="Notify" htmlFor={`${id}-to`}>
            <SelectField<"owner" | "member">
              id={`${id}-to`}
              value={config.to}
              disabled={readOnly}
              options={[
                { value: "owner", label: "Record owner" },
                { value: "member", label: "A teammate" },
              ]}
              onChange={(to) => set({ to })}
            />
          </Field>
          {config.to === "member" && (
            <Field
              label="Teammate"
              htmlFor={`${id}-member`}
              error={fieldErrors.memberId}
            >
              <SelectField
                id={`${id}-member`}
                value={config.memberId}
                disabled={readOnly}
                options={members}
                placeholder="Pick a teammate"
                onChange={(memberId) => set({ memberId })}
              />
            </Field>
          )}
          <Field
            label="Message"
            htmlFor={`${id}-message`}
            error={fieldErrors.message}
          >
            <TemplateInput
              id={`${id}-message`}
              multiline
              rows={3}
              value={config.message ?? ""}
              disabled={readOnly}
              onChange={(message) => set({ message })}
            />
          </Field>
          <TemplatePreview node={node} />
        </>
      );
    }
    case "update_field": {
      const config = configOf(node, "update_field");
      const fields = updateFieldsFor(subject);
      const choices = updateValues(subject, config.field);
      return (
        <>
          <Field
            label="Change"
            htmlFor={`${id}-field`}
            error={fieldErrors.field}
          >
            <SelectField<UpdateField>
              id={`${id}-field`}
              value={fields.includes(config.field) ? config.field : undefined}
              disabled={readOnly}
              options={fields.map((value) => ({
                value,
                label: UPDATE_FIELD_LABEL[value],
              }))}
              onChange={(field) =>
                set({
                  field,
                  value:
                    field === "owner"
                      ? "round_robin"
                      : (updateValues(subject, field)?.[0]?.value ?? ""),
                })
              }
            />
          </Field>
          <Field
            label="To"
            htmlFor={`${id}-value`}
            error={fieldErrors.value ?? fieldErrors.memberId}
          >
            {config.field === "owner" ? (
              <SelectField
                id={`${id}-value`}
                value={config.value}
                disabled={readOnly}
                options={[
                  { value: "round_robin", label: "Next in round-robin" },
                  ...members,
                ]}
                onChange={(value) => set({ value })}
              />
            ) : choices ? (
              <SelectField
                id={`${id}-value`}
                value={config.value}
                disabled={readOnly}
                options={choices}
                onChange={(value) => set({ value })}
              />
            ) : (
              <Input
                id={`${id}-value`}
                value={config.value ?? ""}
                disabled={readOnly}
                placeholder="Tag"
                onChange={(event) => set({ value: event.target.value })}
              />
            )}
          </Field>
        </>
      );
    }
    case "automation": {
      const config = configOf(node, "automation");
      const others = (catalog?.automations ?? []).filter(
        (item) => item._id !== automation._id && item.subjectKind === subject,
      );
      return (
        <>
          <Field label="Action" htmlFor={`${id}-action`}>
            <SelectField<"add" | "remove">
              id={`${id}-action`}
              value={config.action}
              disabled={readOnly}
              options={[
                { value: "add", label: "Add to an automation" },
                { value: "remove", label: "Remove from an automation" },
              ]}
              onChange={(action) => set({ action })}
            />
          </Field>
          <Field
            label="Automation"
            htmlFor={`${id}-automation`}
            error={fieldErrors.automationId}
            hint={
              others.length
                ? `Automations that run on ${SUBJECT_LABEL[subject][1]}.`
                : `No other automation runs on ${SUBJECT_LABEL[subject][1]} yet.`
            }
          >
            <SelectField
              id={`${id}-automation`}
              value={config.automationId || undefined}
              disabled={readOnly || others.length === 0}
              placeholder="Pick an automation"
              options={others.map((item) => ({
                value: item._id,
                label:
                  item.status === "active"
                    ? item.name
                    : `${item.name} (${item.status})`,
              }))}
              onChange={(automationId) => set({ automationId })}
            />
          </Field>
        </>
      );
    }
    case "exit": {
      const config = configOf(node, "exit");
      return (
        <Field
          label="Reason"
          htmlFor={`${id}-reason`}
          hint="Shown on the record's run history."
        >
          <Input
            id={`${id}-reason`}
            value={config.reason ?? ""}
            disabled={readOnly}
            placeholder="They moved on"
            maxLength={120}
            onChange={(event) =>
              set({ reason: event.target.value || undefined })
            }
          />
        </Field>
      );
    }
  }
}

function DeliveryNote({ channel }: { channel: "email" | "whatsapp" }) {
  const { catalog } = useEditor();
  const status = catalog?.providers[channel];
  if (!status) return null;
  const outbox = status.provider === "outbox";
  return (
    <p className="bg-overlay-1 border-border caption-style text-fg-secondary rounded-lg border px-3 py-2.5 leading-snug">
      {outbox ? (
        <>
          <span className="text-foreground font-medium">Outbox only.</span>{" "}
          {status.problem ??
            (channel === "email"
              ? "No email provider is set up, so messages are recorded on the timeline as queued and never sent."
              : "WhatsApp isn't connected, so messages are recorded on the timeline as queued and never sent.")}
        </>
      ) : (
        <>
          <span className="text-foreground font-medium">Sends for real</span>{" "}
          through{" "}
          {status.provider === "meta"
            ? "the WhatsApp Cloud API"
            : status.provider === "novu"
              ? "Novu"
              : "Resend"}
          .
        </>
      )}
    </p>
  );
}
