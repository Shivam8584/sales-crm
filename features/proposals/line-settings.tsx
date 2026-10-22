"use client";

import { useState, type FormEvent, type ReactNode } from "react";
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
import SegmentedControl from "@/components/_ui/segmented-control";
import {
  ARCHETYPE_LABEL,
  COUPON_KINDS,
  COUPON_KIND_LABEL,
  EXPIRY_DAYS,
  OVERSUBSCRIBE,
  PROPOSAL_CURRENCY,
  SHARE_COMMISSION_MAX,
  SLOT_MODES,
  SLOT_MODE_LABEL,
  factorLabel,
  isOrderBased,
  lineProblem,
  parseFactor,
  patchLine,
  type CompanyPolicy,
  type Coupon,
  type CouponKind,
  type LinePatch,
  type ProposalLine,
  type SlotMode,
} from "@/lib/domain/pricing";
import type { AppError } from "@/lib/errors";
import { editableAmount, formatAmount, parseAmount } from "./amount";

type Form = {
  kind: CouponKind;
  bonus: string;
  commission: string;
  slotMode: SlotMode;
  expiryDays: string;
  oversubscribe: string;
};

function initial(line: ProposalLine): Form {
  const { coupon } = line;
  return {
    kind: coupon.kind,
    bonus: coupon.kind === "none" ? "" : editableAmount(coupon.bonus.amount),
    commission:
      coupon.kind === "share" ? editableAmount(coupon.commission.amount) : "",
    slotMode: line.slotMode,
    expiryDays: String(line.expiryDays),
    oversubscribe: String(line.oversubscribe / 100),
  };
}

const money = (amount: number) => ({ amount, currency: PROPOSAL_CURRENCY });

type Errors = Partial<Record<string, string>>;

const FIELDS = ["couponBonus", "commission", "expiryDays", "oversubscribe"];

function errorAt(field: string | undefined, message: string): Errors {
  return { [field && FIELDS.includes(field) ? field : "form"]: message };
}

/** Turns the form into a patch, or the field errors that stop it. */
function toPatch(form: Form): { patch: LinePatch } | { errors: Errors } {
  const errors: Errors = {};
  const bonus = parseAmount(form.bonus);
  const commission = parseAmount(form.commission);
  const expiryDays = Number(form.expiryDays);
  const oversubscribe = parseFactor(form.oversubscribe);
  if (form.kind !== "none" && (bonus === null || bonus === 0)) {
    errors.couponBonus = "Enter the bonus the redeeming creator gets";
  }
  if (form.kind === "share" && (commission === null || commission === 0)) {
    errors.commission = "Enter the commission for the sharing creator";
  }
  if (
    !Number.isInteger(expiryDays) ||
    expiryDays < EXPIRY_DAYS.min ||
    expiryDays > EXPIRY_DAYS.max
  ) {
    errors.expiryDays = `Enter ${EXPIRY_DAYS.min} to ${EXPIRY_DAYS.max} days`;
  }
  if (oversubscribe === null) {
    errors.oversubscribe = "Enter a factor from 1 to 3, like 1.5";
  }
  if (Object.keys(errors).length > 0) return { errors };
  const coupon: Coupon =
    form.kind === "none"
      ? { kind: "none" }
      : form.kind === "promo"
        ? { kind: "promo", bonus: money(bonus!) }
        : {
            kind: "share",
            bonus: money(bonus!),
            commission: money(commission!),
          };
  return {
    patch: {
      coupon,
      slotMode: form.slotMode,
      expiryDays,
      oversubscribe: oversubscribe!,
    },
  };
}

/** Coupon and campaign settings for one line: the fields that don't fit the table. */
export default function LineSettingsDialog({
  line,
  policy,
  readOnly,
  onClose,
  onSave,
}: {
  line: ProposalLine | null;
  policy: CompanyPolicy;
  readOnly: boolean;
  onClose: () => void;
  onSave: (line: ProposalLine, patch: LinePatch) => Promise<AppError | void>;
}) {
  return (
    <Dialog open={line !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-120">
        {line && (
          <SettingsForm
            key={line.key}
            line={line}
            policy={policy}
            readOnly={readOnly}
            onClose={onClose}
            onSave={onSave}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({
  line,
  policy,
  readOnly,
  onClose,
  onSave,
}: {
  line: ProposalLine;
  policy: CompanyPolicy;
  readOnly: boolean;
  onClose: () => void;
  onSave: (line: ProposalLine, patch: LinePatch) => Promise<AppError | void>;
}) {
  const [form, setForm] = useState(() => initial(line));
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const couponsAllowed = isOrderBased(line.archetype);
  const name = line.product || "this line";

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors({});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return onClose();
    const result = toPatch(form);
    if ("errors" in result) return setErrors(result.errors);
    const problem = lineProblem(patchLine(line, result.patch, policy));
    if (problem) return setErrors(errorAt(problem.field, problem.message));
    setSaving(true);
    const failed = await onSave(line, result.patch);
    setSaving(false);
    if (failed) setErrors(errorAt(failed.field, failed.message));
    else onClose();
  }

  const input = (
    id: string,
    key: keyof Form,
    props: { suffix?: ReactNode; prefix?: ReactNode; numeric?: boolean },
  ) => (
    <div className="relative">
      {props.prefix && (
        <span
          aria-hidden
          className="text-fg-tertiary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm"
        >
          {props.prefix}
        </span>
      )}
      <Input
        id={id}
        inputMode={props.numeric ? "numeric" : "decimal"}
        autoComplete="off"
        value={form[key]}
        readOnly={readOnly}
        onChange={(event) => set(key, event.target.value as Form[typeof key])}
        aria-invalid={errors[id] ? true : undefined}
        aria-describedby={errors[id] ? `${id}-error` : `${id}-hint`}
        className={
          "aria-invalid:border-danger tabular-nums" +
          (props.prefix ? " pl-7" : "") +
          (props.suffix ? " pr-14" : "")
        }
      />
      {props.suffix && (
        <span
          aria-hidden
          className="caption-style text-fg-tertiary pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        >
          {props.suffix}
        </span>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Coupon and campaign settings</DialogTitle>
        <DialogDescription className="pr-8">
          {ARCHETYPE_LABEL[line.archetype]} · {name}. These go to the platform
          with the pricing when the campaign is approved.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-6 px-6 py-5">
        <fieldset className="flex flex-col gap-4" disabled={readOnly}>
          <legend className="eyebrow-style text-fg-secondary mb-3">
            Coupon
          </legend>
          {couponsAllowed ? (
            <>
              <SegmentedControl
                label="Coupon"
                value={form.kind}
                onChange={(kind) => set("kind", kind as CouponKind)}
                segments={COUPON_KINDS.map((kind) => ({
                  value: kind,
                  label: COUPON_KIND_LABEL[kind],
                }))}
                className="self-start"
              />
              {form.kind !== "none" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Redeemer bonus"
                    htmlFor="couponBonus"
                    error={errors.couponBonus}
                    hint={
                      form.kind === "promo"
                        ? "Paid by Hypedrive, out of the platform fee"
                        : "Comes out of the bonus pool"
                    }
                  >
                    {input("couponBonus", "bonus", { prefix: "₹" })}
                  </Field>
                  {form.kind === "share" && (
                    <Field
                      label="Referral commission"
                      htmlFor="commission"
                      error={errors.commission}
                      hint={`To the sharing creator, up to ${formatAmount(SHARE_COMMISSION_MAX, PROPOSAL_CURRENCY)}`}
                    >
                      {input("commission", "commission", { prefix: "₹" })}
                    </Field>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="text-fg-tertiary text-sm">
              Coupons only apply to online purchases.
            </p>
          )}
        </fieldset>
        <div className="border-border border-t" />
        <fieldset className="flex flex-col gap-4" disabled={readOnly}>
          <legend className="eyebrow-style text-fg-secondary mb-3">
            Campaign
          </legend>
          <div className="flex flex-col gap-2">
            <span className="caption-style text-fg-secondary">Slots</span>
            <SegmentedControl
              label="How slots are shared"
              value={form.slotMode}
              onChange={(slotMode) => set("slotMode", slotMode as SlotMode)}
              segments={SLOT_MODES.map((mode) => ({
                value: mode,
                label: SLOT_MODE_LABEL[mode],
              }))}
              className="self-start"
            />
            <span className="caption-style text-fg-tertiary leading-snug">
              {form.slotMode === "lines"
                ? "Each product variant gets its own seats."
                : "Every variant draws on the same seats, first come first served."}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Enrollment window"
              htmlFor="expiryDays"
              error={errors.expiryDays}
              hint={`Days to submit, ${EXPIRY_DAYS.min}–${EXPIRY_DAYS.max}`}
            >
              {input("expiryDays", "expiryDays", {
                suffix: "days",
                numeric: true,
              })}
            </Field>
            <Field
              label="Oversubscribe factor"
              htmlFor="oversubscribe"
              error={errors.oversubscribe}
              hint={`${factorLabel(OVERSUBSCRIBE.min)}–${factorLabel(OVERSUBSCRIBE.max)}; up to ${Math.floor(
                (line.slots *
                  (parseFactor(form.oversubscribe) ?? line.oversubscribe)) /
                  100,
              ).toLocaleString("en-IN")} enrollments`}
            >
              {input("oversubscribe", "oversubscribe", {})}
            </Field>
          </div>
        </fieldset>
        {errors.form && (
          <p role="alert" className="caption-style text-danger">
            {errors.form}
          </p>
        )}
      </div>
      <DialogFooter>
        {readOnly ? (
          <DialogClose asChild>
            <Button variant="secondary" size="sm">
              Close
            </Button>
          </DialogClose>
        ) : (
          <>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" variant="primary" size="sm" loading={saving}>
              Save
            </Button>
          </>
        )}
      </DialogFooter>
    </form>
  );
}
