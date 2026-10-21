"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import {
  SettingsRow,
  SettingsSection,
  SettingsSkeleton,
  Code,
} from "@/features/settings/settings-ui";
import {
  CASHBACK_FLOOR_BPS,
  DEFAULT_COMPANY_POLICY,
  EXPIRY_DAYS,
  OVERSUBSCRIBE,
  POLICY_FIELDS,
  PROPOSAL_CURRENCY,
  SHARE_COMMISSION_MAX,
  TAX_BPS,
  bpsLabel,
  factorLabel,
  parsePercent,
  policyProblem,
  type PolicyField,
} from "@/lib/domain/pricing";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { formatAmount } from "./amount";

type Policy = FunctionReturnType<typeof api.proposals.policy>;

const KEY = (field: PolicyField) => `pricing.${field}` as const;

const COPY: Record<PolicyField, { label: string; description: string }> = {
  marginFloorBps: {
    label: "Margin floor",
    description:
      "The only approval rule: a proposal with any line, or its blended margin, under this needs a manager's approval before it goes to the brand.",
  },
  defaultMarginBps: {
    label: "Default margin",
    description:
      "Lines without a price are priced to leave this margin, rounded up to a rupee.",
  },
  defaultFundBps: {
    label: "Default order fund",
    description:
      "Suggested share of each order the brand funds on new online-purchase lines.",
  },
  defaultFeeBps: {
    label: "Default order cut",
    description:
      "Suggested platform cut of each order. Fund − cut is the creator's cashback and stays at 50% or more.",
  },
  defaultBonusFeeBps: {
    label: "Default bonus cut",
    description: "Suggested platform cut of the creator bonus on new lines.",
  },
};

const money = (amount: number) => formatAmount(amount, PROPOSAL_CURRENCY);

/** Settings → Workspace: the company's pricing rules for the deal desk, and the platform's fixed ones. */
export default function PricingPolicySettings() {
  const data = useQuery(api.proposals.policy, {});
  if (!data) return <SettingsSkeleton rows={5} />;
  const floor = data.policy.platformFloor;

  return (
    <>
      <SettingsSection
        title="Pricing policy"
        description="Company rules the deal desk prices and approves against. Sent proposals keep the policy they were sent under."
      >
        {POLICY_FIELDS.map((field) => (
          <PolicyRow
            key={`${field}-${data.policy[field]}`}
            field={field}
            data={data}
          />
        ))}
      </SettingsSection>
      <SettingsSection
        title="Platform rules"
        description="Set by the Hypedrive platform, not by this workspace. Proposals that break them can't be sent."
      >
        <SettingsRow
          label="Platform minimum margin"
          description={
            <>
              The platform fee on each enrollment must reach this. From{" "}
              <Code>PLATFORM_MIN_MARGIN_RATE</Code> and{" "}
              <Code>PLATFORM_MIN_MARGIN_ABS</Code> on the Convex deployment,
              matching the platform; both default to 0.
            </>
          }
        >
          <span className="text-sm tabular-nums">
            {bpsLabel(floor.rateBps)} of the bill
            {floor.minimum > 0 && `, at least ${money(floor.minimum)}`}
          </span>
        </SettingsRow>
        <SettingsRow
          label="Fixed limits"
          description={`Creator cashback (fund − cut) at least ${bpsLabel(CASHBACK_FLOOR_BPS)}; share commission up to ${money(SHARE_COMMISSION_MAX)}; enrollment window ${EXPIRY_DAYS.min}–${EXPIRY_DAYS.max} days; oversubscribe ${factorLabel(OVERSUBSCRIBE.min)}–${factorLabel(OVERSUBSCRIBE.max)}; GST ${bpsLabel(TAX_BPS)}.`}
        />
      </SettingsSection>
    </>
  );
}

function PolicyRow({ field, data }: { field: PolicyField; data: Policy }) {
  const set = useMutation(api.settings.set);
  const current = data.policy[field];
  const isDefault = data.isDefault[field];
  const fallback = DEFAULT_COMPANY_POLICY[field];
  const shown = bpsLabel(current).replace("%", "");
  const [value, setValue] = useState(shown);
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== shown;
  const id = `policy-${field}`;
  const { label, description } = COPY[field];

  async function save(next: number | null) {
    setSaving(true);
    setError(undefined);
    try {
      const { previous } = await set({
        setting: { key: KEY(field), value: next },
      });
      toast(
        next === null
          ? `${label} reset to ${bpsLabel(fallback)}`
          : `${label} set to ${bpsLabel(next)}`,
        () => {
          set({
            setting: { key: KEY(field), value: previous as number | null },
          }).catch((reason) =>
            toast(readError(reason).message, { tone: "danger" }),
          );
        },
      );
    } catch (reason) {
      setError(
        readError(reason, `Couldn't save the ${label.toLowerCase()}`).message,
      );
    } finally {
      setSaving(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const bps = parsePercent(value);
    if (bps === null) {
      setError("Enter a rate from 0 to 100, like 12.5");
      return;
    }
    const problem = policyProblem({ ...data.policy, [field]: bps });
    if (problem) {
      setError(problem);
      return;
    }
    if (bps !== current || isDefault) void save(bps);
  }

  return (
    <form onSubmit={submit} noValidate>
      <SettingsRow
        label={label}
        htmlFor={id}
        description={
          <>
            {description}{" "}
            {isDefault
              ? "Using the default."
              : `Default is ${bpsLabel(fallback)}.`}
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
                id={id}
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(undefined);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && dirty) {
                    event.stopPropagation();
                    setValue(shown);
                    setError(undefined);
                  }
                }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-error` : undefined}
                className="aria-invalid:border-danger w-24 pr-8 text-right tabular-nums"
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
              id={`${id}-error`}
              role="alert"
              className="caption-style text-danger max-w-64 leading-snug sm:text-right"
            >
              {error}
            </span>
          )}
        </div>
      </SettingsRow>
    </form>
  );
}
