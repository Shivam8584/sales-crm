"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import { Textarea } from "@/components/_ui/textarea";
import {
  GST_STATES,
  GSTIN_LENGTH,
  checkGstin,
  gstinError,
  normalizeGstin,
} from "@/lib/domain/gstin";
import {
  CONSENT_TEXT,
  ORDER_BANDS,
  parseLeadSubmission,
  type LeadFieldErrors,
  type LeadFormField,
} from "@/lib/domain/leads";
import { cn } from "@/lib/utils";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";
import ChevronDownIcon from "@/public/assets/icons/chevron-down.svg";
import { captureAttribution, type Attribution } from "./attribution";
import DemoBooking, { type SubmittedLead } from "./demo-booking";

const ENDPOINT = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""}/leads`;
const NETWORK_ERROR =
  "We couldn't send your request. Check your connection and try again.";
const SERVER_ERROR = "Something went wrong on our side. Try again in a moment.";
const RATE_ERROR =
  "You've sent a few requests in a row. Wait a minute and try again.";

function fieldsToFix(found: LeadFieldErrors) {
  const count = new Set(
    Object.keys(found).map((field) => (field === "contact" ? "email" : field)),
  ).size;
  return count === 1
    ? "Fix the highlighted field to send your request."
    : `Fix the ${count} highlighted fields to send your request.`;
}

type FormState = {
  name: string;
  email: string;
  phone: string;
  companyName: string;
  website: string;
  gstin: string;
  ordersBand: string;
  message: string;
  consent: boolean;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  companyName: "",
  website: "",
  gstin: "",
  ordersBand: "",
  message: "",
  consent: false,
};

const FIELD_IDS: [LeadFormField, string][] = [
  ["name", "demo-name"],
  ["email", "demo-email"],
  ["contact", "demo-email"],
  ["phone", "demo-phone"],
  ["companyName", "demo-company"],
  ["website", "demo-website"],
  ["gstin", "demo-gstin"],
  ["ordersBand", "demo-orders-0"],
  ["message", "demo-message"],
  ["consent", "demo-consent"],
];
const DETAIL_FIELDS: LeadFormField[] = ["gstin", "ordersBand", "message"];

const TEXTAREA_CLASS = "max-h-48 min-h-20 max-sm:text-base";

const INPUT_CLASS = "aria-invalid:border-danger h-10 max-sm:text-base";

function describedBy(id: string, error?: string, hint?: boolean) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

/** The public demo request form; after submitting it becomes the booking step. */
export default function DemoForm({ embed = false }: { embed?: boolean }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<LeadFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [submitted, setSubmitted] = useState<SubmittedLead | null>(null);
  const loadedAt = useRef(0);
  const attribution = useRef<Attribution | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadedAt.current = Date.now();
    attribution.current = captureAttribution();
  }, []);

  const gstinCheck = form.gstin ? checkGstin(form.gstin) : null;
  const gstinLive =
    gstinCheck && !gstinCheck.ok && gstinCheck.reason !== "short"
      ? gstinError(gstinCheck)
      : null;
  const gstinState = gstinCheck?.ok
    ? GST_STATES[gstinCheck.gstin.slice(0, 2)]
    : undefined;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    const cleared: LeadFormField[] =
      key === "email" || key === "phone"
        ? [key, "contact"]
        : [key as LeadFormField];
    if (cleared.some((field) => errors[field])) {
      const next = { ...errors };
      for (const field of cleared) delete next[field];
      setErrors(next);
      setFormError(Object.keys(next).length > 0 ? fieldsToFix(next) : null);
    }
  }

  function focusFirst(found: LeadFieldErrors) {
    const first = FIELD_IDS.find(([field]) => found[field]);
    if (!first) return;
    if (DETAIL_FIELDS.includes(first[0])) setDetailsOpen(true);
    requestAnimationFrame(() => document.getElementById(first[1])?.focus());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const payload = {
      ...form,
      ...(attribution.current ?? captureAttribution()),
      kind: "demo",
      fax: honeypot.current?.value ?? "",
      elapsedMs: Date.now() - loadedAt.current,
    };
    const check = parseLeadSubmission(payload);
    if (!check.ok) {
      setErrors(check.errors);
      setFormError(fieldsToFix(check.errors));
      focusFirst(check.errors);
      return;
    }

    setPending(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        leadId?: string;
        errors?: LeadFieldErrors;
      };
      if (response.status === 422 && result.errors) {
        setErrors(result.errors);
        setFormError(fieldsToFix(result.errors));
        focusFirst(result.errors);
        return;
      }
      if (!response.ok || !result.ok) {
        setFormError(response.status === 429 ? RATE_ERROR : SERVER_ERROR);
        return;
      }
      setSubmitted({
        leadId: result.leadId ?? null,
        name: check.value.name,
        email: check.value.email ?? null,
        phone: check.value.phone ?? null,
        companyName: check.value.companyName,
      });
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  if (submitted) return <DemoBooking lead={submitted} embed={embed} />;

  const contactError = errors.contact;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-labelledby="demo-form-title"
      className={cn(
        "relative flex flex-col gap-5",
        !embed && "bg-card shadow-card rounded-2xl p-5 sm:p-7",
      )}
    >
      <div className="flex flex-col gap-2.5">
        <h2 id="demo-form-title" className="text-lg leading-6 font-semibold">
          Book a demo
        </h2>
        <p className="text-fg-secondary">
          Takes under a minute. Fields marked{" "}
          <span className="whitespace-nowrap">* are required.</span>
        </p>
      </div>

      <Field label="Your name" htmlFor="demo-name" required error={errors.name}>
        <Input
          id="demo-name"
          name="name"
          autoComplete="name"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
          aria-required
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy("demo-name", errors.name)}
          className={INPUT_CLASS}
        />
      </Field>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          contactError ? "demo-contact-error" : "demo-contact-hint"
        }
      >
        <legend className="sr-only">How should we reach you?</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work email" htmlFor="demo-email" error={errors.email}>
            <Input
              id="demo-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="you@yourbrand.in"
              aria-invalid={errors.email || contactError ? true : undefined}
              aria-describedby={describedBy("demo-email", errors.email)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Phone or WhatsApp"
            htmlFor="demo-phone"
            error={errors.phone}
          >
            <Input
              id="demo-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="98200 12345"
              aria-invalid={errors.phone || contactError ? true : undefined}
              aria-describedby={describedBy("demo-phone", errors.phone)}
              className={cn(INPUT_CLASS, "tabular-nums")}
            />
          </Field>
        </div>
        {contactError ? (
          <span
            id="demo-contact-error"
            role="alert"
            className="caption-style text-danger leading-snug"
          >
            {contactError}
          </span>
        ) : (
          <span
            id="demo-contact-hint"
            className="caption-style text-fg-tertiary leading-snug"
          >
            Add at least one so a specialist can reach you.
          </span>
        )}
      </fieldset>

      <Field
        label="Brand name"
        htmlFor="demo-company"
        required
        error={errors.companyName}
      >
        <Input
          id="demo-company"
          name="companyName"
          autoComplete="organization"
          value={form.companyName}
          onChange={(event) => update("companyName", event.target.value)}
          aria-required
          aria-invalid={errors.companyName ? true : undefined}
          aria-describedby={describedBy("demo-company", errors.companyName)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field
        label="Website or store link"
        htmlFor="demo-website"
        hint="Your site, Shopify store or Amazon / Flipkart storefront."
        error={errors.website}
      >
        <Input
          id="demo-website"
          name="website"
          inputMode="url"
          autoComplete="url"
          spellCheck={false}
          value={form.website}
          onChange={(event) => update("website", event.target.value)}
          placeholder="yourbrand.in"
          aria-invalid={errors.website ? true : undefined}
          aria-describedby={describedBy("demo-website", errors.website, true)}
          className={INPUT_CLASS}
        />
      </Field>

      <div className="border-border flex flex-col border-t pt-3">
        <button
          type="button"
          aria-expanded={detailsOpen}
          aria-controls="demo-details"
          onClick={() => setDetailsOpen((open) => !open)}
          className="lead-style text-fg-secondary hover:text-foreground focus-visible:ring-ring duration-fast -mx-1.5 flex cursor-pointer items-center justify-between gap-2 rounded-md px-1.5 py-2 text-left transition-colors outline-none focus-visible:ring-2"
        >
          <span>
            Help us prepare <span className="text-fg-tertiary">(optional)</span>
          </span>
          <ChevronDownIcon
            aria-hidden
            data-open={detailsOpen}
            className="text-fg-tertiary duration-base ease-power3-out size-3 transition-transform data-[open=true]:rotate-180"
          />
        </button>
        <div
          id="demo-details"
          hidden={!detailsOpen}
          className="flex flex-col gap-5 pt-3"
        >
          <Field
            label="GSTIN"
            htmlFor="demo-gstin"
            error={errors.gstin ?? gstinLive ?? undefined}
            hint={
              gstinCheck?.ok
                ? undefined
                : form.gstin
                  ? `${form.gstin.length} of ${GSTIN_LENGTH} characters.`
                  : "Helps us check marketplace eligibility, like 29AAACI4798L1ZU."
            }
            trailing={
              gstinCheck?.ok ? (
                <span className="caption-style text-success flex items-center gap-1">
                  <CheckCircleIcon aria-hidden className="size-3" />
                  Valid{gstinState ? ` · ${gstinState}` : ""}
                </span>
              ) : undefined
            }
          >
            <Input
              id="demo-gstin"
              name="gstin"
              autoComplete="off"
              spellCheck={false}
              maxLength={GSTIN_LENGTH}
              value={form.gstin}
              onChange={(event) =>
                update("gstin", normalizeGstin(event.target.value))
              }
              placeholder="29AAACI4798L1ZU"
              aria-invalid={errors.gstin || gstinLive ? true : undefined}
              aria-describedby={describedBy(
                "demo-gstin",
                errors.gstin ?? gstinLive ?? undefined,
                !gstinCheck?.ok,
              )}
              className={cn(INPUT_CLASS, "font-mono uppercase tabular-nums")}
            />
          </Field>

          <fieldset className="flex flex-col gap-2.5">
            <legend className="caption-style text-fg-secondary mb-2.5 font-medium">
              Monthly orders
            </legend>
            <div className="flex flex-wrap gap-2">
              {ORDER_BANDS.map((band, index) => (
                <label
                  key={band.value}
                  className="border-input bg-secondary text-fg-secondary hover:text-foreground has-checked:border-selected has-checked:bg-overlay-2 has-checked:text-foreground has-focus-visible:ring-selected/20 duration-fast flex h-8 cursor-pointer items-center rounded-full border px-3 text-xs leading-none transition-[color,border-color,background-color,box-shadow] select-none has-focus-visible:ring-3"
                >
                  <input
                    id={`demo-orders-${index}`}
                    type="radio"
                    name="ordersBand"
                    value={band.value}
                    checked={form.ordersBand === band.value}
                    onChange={() => update("ordersBand", band.value)}
                    className="sr-only"
                  />
                  {band.label}
                </label>
              ))}
            </div>
            {errors.ordersBand && (
              <span role="alert" className="caption-style text-danger">
                {errors.ordersBand}
              </span>
            )}
          </fieldset>

          <Field
            label="Anything we should know?"
            htmlFor="demo-message"
            error={errors.message}
          >
            <Textarea
              id="demo-message"
              name="message"
              rows={3}
              maxLength={2000}
              value={form.message}
              onChange={(event) => update("message", event.target.value)}
              placeholder="Products you're launching, where you sell, goals for the next quarter"
              aria-invalid={errors.message ? true : undefined}
              aria-describedby={describedBy("demo-message", errors.message)}
              className={TEXTAREA_CLASS}
            />
          </Field>
        </div>
      </div>

      <div
        aria-hidden
        className="absolute -left-[9999px] size-px overflow-hidden"
      >
        <label htmlFor="demo-fax">Fax</label>
        <input
          ref={honeypot}
          id="demo-fax"
          name="fax"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="demo-consent"
            checked={form.consent}
            onCheckedChange={(checked) => update("consent", checked === true)}
            aria-required
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "demo-consent-error" : undefined}
            className="mt-0.5"
          />
          <label
            htmlFor="demo-consent"
            className="p-style text-fg-secondary cursor-pointer leading-snug select-none"
          >
            {CONSENT_TEXT}
          </label>
        </div>
        {errors.consent && (
          <span
            id="demo-consent-error"
            role="alert"
            className="caption-style text-danger pl-7 leading-snug"
          >
            {errors.consent}
          </span>
        )}
      </div>

      {formError && (
        <p role="alert" className="caption-style text-danger leading-snug">
          {formError}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={pending}
          className="h-11 w-full text-sm"
        >
          Request a demo
        </Button>
        <p className="caption-style text-fg-tertiary text-center leading-snug">
          A specialist replies within one business hour. No spam.
        </p>
      </div>
    </form>
  );
}
