"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/_ui/dialog";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Skeleton from "@/components/_ui/skeleton";
import OptionPicker, { type Option } from "@/components/fields/option-picker";
import { LEAD_KINDS } from "@/lib/domain/enums";
import { LEAD_KIND_LABEL } from "@/lib/domain/labels";
import { LEAD_SOURCE_LABEL } from "@/lib/domain/leads";
import {
  MAX_ROUTING_RULES,
  describeCondition,
  type RuleCondition,
} from "@/lib/domain/routing";
import { HOT_MIN, HOT_SLA_PERCENT } from "@/lib/domain/scoring";
import { useMembers } from "@/hooks/use-viewer";
import { ownerOptions } from "@/features/leads/lead-meta";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import PlusIcon from "@/public/assets/icons/plus.svg";
import TrashIcon from "@/public/assets/icons/trash.svg";
import { SettingsBlock, SettingsRow, SettingsSection } from "./settings-ui";

const RULES_KEY = "routing.rules";
const HOT_KEY = "routing.hotSlaFactor";
const ANY = "any";
const ROUND_ROBIN = "round-robin";
const PICKER_CLASS =
  "border-input bg-secondary mx-0 h-9 w-full rounded-lg border px-3";

type Settings = FunctionReturnType<typeof api.settings.get>;
type Rule = Settings[typeof RULES_KEY][number];

function sourceLabel(source: string) {
  return LEAD_SOURCE_LABEL[source] ?? source;
}

/** Admin-set rules that pick the owner of a new lead; the first match wins. */
export function RoutingRules() {
  const settings = useQuery(api.settings.get, {});
  const members = useMembers();
  const set = useMutation(api.settings.set);
  const [adding, setAdding] = useState(false);
  const rules = settings?.[RULES_KEY];

  async function save(next: Rule[], message: string) {
    try {
      const { previous } = await set({
        setting: { key: RULES_KEY, value: next.length > 0 ? next : null },
      });
      toast(message, () => {
        set({
          setting: { key: RULES_KEY, value: previous as Rule[] | null },
        }).catch((reason) =>
          toast(readError(reason).message, { tone: "danger" }),
        );
      });
      return true;
    } catch (reason) {
      toast(readError(reason, "Couldn't save the rules").message, {
        tone: "danger",
      });
      return false;
    }
  }

  function move(index: number, by: -1 | 1) {
    if (!rules) return;
    const next = [...rules];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    void save(next, `Moved ${rules[index].name}`);
  }

  function assignee(rule: Rule) {
    if ("roundRobin" in rule.assign) return "Round-robin";
    const id = rule.assign.memberId;
    return members?.find((member) => member._id === id)?.name ?? "Inactive";
  }

  return (
    <SettingsSection
      title="Routing rules"
      description="The first rule that matches picks the owner of a new lead. Anything else rotates round-robin. Applies to leads that arrive from now on."
      action={
        <Button
          variant="secondary"
          size="xs"
          disabled={!rules || rules.length >= MAX_ROUTING_RULES}
          onClick={() => setAdding(true)}
        >
          <PlusIcon aria-hidden className="size-3" />
          Add rule
        </Button>
      }
    >
      {!rules ? (
        <>
          <RowSkeleton />
          <RowSkeleton />
        </>
      ) : rules.length === 0 ? (
        <SettingsBlock>
          <p className="caption-style text-fg-tertiary leading-snug">
            No rules yet, so every new lead rotates round-robin. Add one to send
            hot demo requests, or leads with a GSTIN, to a specific person.
          </p>
        </SettingsBlock>
      ) : (
        <ol aria-label="Routing rules" className="flex flex-col">
          {rules.map((rule, index) => (
            <li
              key={rule.id}
              className="border-border flex min-h-13 items-center gap-3 border-t px-4 py-2 sm:px-5"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="lead-style truncate">{rule.name}</span>
                <span className="caption-style text-fg-tertiary truncate">
                  {describeCondition(rule.when, sourceLabel)} → {assignee(rule)}
                </span>
              </span>
              <span className="flex shrink-0 items-center">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${rule.name} up`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ChevronDownIcon aria-hidden className="size-3 rotate-180" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${rule.name} down`}
                  disabled={index === rules.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ChevronDownIcon aria-hidden className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${rule.name}`}
                  onClick={() =>
                    void save(
                      rules.filter((item) => item.id !== rule.id),
                      `Removed ${rule.name}`,
                    )
                  }
                >
                  <TrashIcon aria-hidden className="size-3.5" />
                </Button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <AddRuleDialog
        open={adding}
        onOpenChange={setAdding}
        members={ownerOptions(members, null)}
        onAdd={(rule) => save([...(rules ?? []), rule], `Added ${rule.name}`)}
      />
    </SettingsSection>
  );
}

type Draft = {
  name: string;
  kind: string;
  source: string;
  scoreMin: string;
  emailType: string;
  gst: string;
  assignee: string;
};

const EMPTY: Draft = {
  name: "",
  kind: ANY,
  source: ANY,
  scoreMin: "",
  emailType: ANY,
  gst: ANY,
  assignee: ROUND_ROBIN,
};

const anyOr = (options: Option[]): Option[] => [
  { value: ANY, label: "Any" },
  ...options,
];

const KIND_OPTIONS = anyOr(
  LEAD_KINDS.map((value) => ({ value, label: LEAD_KIND_LABEL[value] })),
);
const SOURCE_OPTIONS = anyOr(
  Object.entries(LEAD_SOURCE_LABEL).map(([value, label]) => ({
    value,
    label,
  })),
);
const EMAIL_OPTIONS = anyOr([
  { value: "company", label: "Company email" },
  { value: "free", label: "Free email (Gmail, Yahoo…)" },
]);
const GST_OPTIONS = anyOr([
  { value: "yes", label: "Has a GSTIN" },
  { value: "no", label: "No GSTIN" },
]);

function AddRuleDialog({
  open,
  onOpenChange,
  members,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: Option[];
  onAdd: (rule: Rule) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(EMPTY);
  const [errors, setErrors] = useState<
    Partial<Record<"name" | "scoreMin", string>>
  >({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();
    const scoreMin = draft.scoreMin.trim() ? Number(draft.scoreMin) : undefined;
    const next: typeof errors = {};
    if (!name) next.name = "Name the rule";
    if (
      scoreMin !== undefined &&
      (!Number.isInteger(scoreMin) || scoreMin < 1 || scoreMin > 100)
    ) {
      next.scoreMin = "Enter a whole number from 1 to 100";
    }
    setErrors(next);
    if (next.name || next.scoreMin) return;

    const when: RuleCondition = {};
    if (draft.kind !== ANY) when.kind = draft.kind as RuleCondition["kind"];
    if (draft.source !== ANY) when.source = draft.source;
    if (scoreMin !== undefined) when.scoreMin = scoreMin;
    if (draft.emailType !== ANY) {
      when.emailType = draft.emailType as RuleCondition["emailType"];
    }
    if (draft.gst !== ANY) when.hasGst = draft.gst === "yes";
    setSaving(true);
    const added = await onAdd({
      id: crypto.randomUUID().slice(0, 8),
      name,
      when,
      assign:
        draft.assignee === ROUND_ROBIN
          ? { roundRobin: true }
          : { memberId: draft.assignee as Id<"members"> },
    });
    setSaving(false);
    if (added) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-110"
        onCloseAutoFocus={() => {
          setDraft(EMPTY);
          setErrors({});
        }}
      >
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add routing rule</DialogTitle>
            <DialogDescription>
              New leads that match every condition below go to the person you
              pick. Leave a condition on Any to ignore it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 px-6 py-5">
            <Field
              label="Name"
              htmlFor="rule-name"
              required
              error={errors.name}
            >
              <Input
                id="rule-name"
                autoFocus
                autoComplete="off"
                maxLength={60}
                value={draft.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Hot demo requests"
                aria-invalid={errors.name ? true : undefined}
                className="aria-invalid:border-danger"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Choice label="Kind">
                <OptionPicker
                  label="Kind"
                  value={draft.kind}
                  options={KIND_OPTIONS}
                  onChange={(value) => set("kind", value ?? ANY)}
                  className={PICKER_CLASS}
                />
              </Choice>
              <Choice label="Source">
                <OptionPicker
                  label="Source"
                  value={draft.source}
                  options={SOURCE_OPTIONS}
                  onChange={(value) => set("source", value ?? ANY)}
                  className={PICKER_CLASS}
                />
              </Choice>
              <Choice label="Email">
                <OptionPicker
                  label="Email"
                  value={draft.emailType}
                  options={EMAIL_OPTIONS}
                  onChange={(value) => set("emailType", value ?? ANY)}
                  className={PICKER_CLASS}
                />
              </Choice>
              <Choice label="GSTIN">
                <OptionPicker
                  label="GSTIN"
                  value={draft.gst}
                  options={GST_OPTIONS}
                  onChange={(value) => set("gst", value ?? ANY)}
                  className={PICKER_CLASS}
                />
              </Choice>
            </div>
            <Field
              label="Minimum score"
              htmlFor="rule-score"
              hint={`Leave empty for any score. ${HOT_MIN} and up is hot.`}
              error={errors.scoreMin}
            >
              <Input
                id="rule-score"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={draft.scoreMin}
                onChange={(event) => set("scoreMin", event.target.value)}
                placeholder="Any"
                aria-invalid={errors.scoreMin ? true : undefined}
                className="aria-invalid:border-danger w-28 tabular-nums"
              />
            </Field>
            <Choice label="Assign to">
              <OptionPicker
                label="Assign to"
                value={draft.assignee}
                options={[
                  { value: ROUND_ROBIN, label: "Round-robin" },
                  ...members,
                ]}
                onChange={(value) => set("assignee", value ?? ROUND_ROBIN)}
                className={PICKER_CLASS}
              />
            </Choice>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="subtle" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Add rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Choice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-2">
      <span aria-hidden className="caption-style text-fg-secondary">
        {label}
      </span>
      {children}
    </div>
  );
}

/** First-touch window for hot leads as a percent of the normal SLA. */
export function HotSlaRow() {
  const settings = useQuery(api.settings.get, {});
  if (!settings) return <RowSkeleton />;
  return <HotSlaForm key={settings[HOT_KEY]} settings={settings} />;
}

function HotSlaForm({ settings }: { settings: Settings }) {
  const set = useMutation(api.settings.set);
  const current = Math.round(settings[HOT_KEY] * 100);
  const fallback = Math.round(settings.defaults[HOT_KEY] * 100);
  const isDefault = settings.isDefault[HOT_KEY];
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const parsed = Number(value);
  const dirty = value.trim() !== String(current);

  async function save(next: number | null) {
    setSaving(true);
    setError(undefined);
    try {
      const { previous } = await set({
        setting: { key: HOT_KEY, value: next === null ? null : next / 100 },
      });
      toast(
        next === null
          ? `Hot lead SLA reset to ${fallback}%`
          : `Hot lead SLA set to ${next}%`,
        () => {
          set({
            setting: { key: HOT_KEY, value: previous as number | null },
          }).catch((reason) =>
            toast(readError(reason).message, { tone: "danger" }),
          );
        },
      );
    } catch (reason) {
      setError(readError(reason, "Couldn't save the SLA").message);
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (
      !Number.isInteger(parsed) ||
      parsed < HOT_SLA_PERCENT.min ||
      parsed > HOT_SLA_PERCENT.max ||
      value.trim() === ""
    ) {
      setError(
        `Enter a whole percent between ${HOT_SLA_PERCENT.min} and ${HOT_SLA_PERCENT.max}`,
      );
      return;
    }
    if (parsed !== current || isDefault) void save(parsed);
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsRow
        label="Hot lead SLA"
        htmlFor="hot-sla"
        description={
          <>
            Leads scoring {HOT_MIN}+ must be touched within this share of the
            first-touch SLA.{" "}
            {isDefault ? "Using the default." : `Default is ${fallback}%.`}
          </>
        }
        className="sm:items-start"
      >
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <div className="flex items-center gap-2">
            {!isDefault && !dirty && (
              <Button
                variant="secondary"
                size="xs"
                onClick={() => void save(null)}
                disabled={saving}
              >
                Reset
              </Button>
            )}
            <div className="relative">
              <Input
                id="hot-sla"
                type="number"
                inputMode="numeric"
                min={HOT_SLA_PERCENT.min}
                max={HOT_SLA_PERCENT.max}
                step={1}
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(undefined);
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "hot-sla-error" : undefined}
                className="aria-invalid:border-danger w-28 [appearance:textfield] pr-9 tabular-nums [&::-webkit-inner-spin-button]:appearance-none"
              />
              <span
                aria-hidden
                className="caption-style text-fg-tertiary pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
              >
                %
              </span>
            </div>
            <Button
              type="submit"
              variant={dirty ? "primary" : "secondary"}
              size="control"
              className="h-9 px-4"
              disabled={!dirty}
              loading={saving}
            >
              Save
            </Button>
          </div>
          {error && (
            <span
              id="hot-sla-error"
              role="alert"
              className="caption-style text-danger leading-snug"
            >
              {error}
            </span>
          )}
        </div>
      </SettingsRow>
    </form>
  );
}

function RowSkeleton() {
  return (
    <div className="border-border flex h-13 items-center gap-3 border-t px-4 sm:px-5">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="ml-auto h-3 w-16" />
    </div>
  );
}
