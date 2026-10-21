"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { FunctionReturnType } from "convex/server";
import type { internal } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import { Checkbox } from "@/components/_ui/checkbox";
import Field from "@/components/_ui/field";
import { Input } from "@/components/_ui/input";
import Tag, { type TagTone } from "@/components/_ui/tag";
import SegmentBar from "@/components/_common/segment-bar";
import {
  captureAttribution,
  type Attribution,
} from "@/features/demo/attribution";
import {
  REVIEW_GAP_CONSENT,
  formatCount,
  marketplaceName,
  parseReviewGap,
  type ReviewGapErrors,
  type ReviewGapField,
  type ScoreBand,
} from "@/lib/domain/prospecting";
import { cn } from "@/lib/utils";
import Logo from "@/public/assets/images/_common/logo.svg";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import CheckCircleIcon from "@/public/assets/icons/check-circle.svg";

type Report = FunctionReturnType<typeof internal.prospecting.recordAudit>;
type Submitted = { report: Report };

const ENDPOINT = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""}/review-gap`;
const NETWORK_ERROR =
  "We couldn't run the check. Check your connection and try again.";
const SERVER_ERROR = "Something went wrong on our side. Try again in a moment.";
const INPUT_CLASS = "aria-invalid:border-danger h-10 max-sm:text-base";

const FIELD_IDS: [ReviewGapField, string][] = [
  ["url", "gap-url"],
  ["email", "gap-email"],
  ["contact", "gap-email"],
  ["phone", "gap-phone"],
  ["consent", "gap-consent"],
];

const VERDICT: Record<ScoreBand, { title: string; tone: TagTone }> = {
  hot: { title: "Far behind your category", tone: "red" },
  warm: { title: "Behind your category", tone: "amber" },
  cool: { title: "Close to your category leaders", tone: "green" },
};

const STEPS = [
  "Paste the link to one of your product pages.",
  "We read its ratings and compare them with the leaders in its category.",
  "You see the gap right away, and a specialist can show you how to close it.",
];

function describedBy(id: string, error?: string, hint?: boolean) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

/** Public "How far behind is your listing?" check, scored by the same engine as Prospecting. */
export default function ReviewGapPage() {
  const [submitted, setSubmitted] = useState<Submitted | null>(null);
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-5 sm:px-8">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <span className="flex min-w-0 flex-col gap-1">
          <span className="lead-style font-medium tracking-[-0.01em]">
            Hypedrive
          </span>
          <span className="caption-style text-fg-tertiary">
            Review-gap check
          </span>
        </span>
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-10 px-5 pt-6 pb-16 sm:px-8 sm:pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-rows-[auto_1fr] lg:gap-x-20 lg:gap-y-12 lg:pt-16">
        <div className="flex flex-col gap-5">
          <p className="eyebrow-style text-fg-tertiary">
            Free for marketplace sellers
          </p>
          <h1 className="text-display font-semibold tracking-[-0.025em] text-balance sm:text-[2.5rem] sm:leading-[1.1]">
            How far behind is your listing?
          </h1>
          <p className="text-fg-secondary max-w-[34rem] text-base leading-relaxed text-pretty">
            Shoppers on Amazon, Flipkart, Nykaa and Myntra buy the product with
            the most ratings. See how many your listing has next to the leaders
            in its category.
          </p>
        </div>
        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="lg:sticky lg:top-8">
            {submitted ? (
              <ReportCard
                submitted={submitted}
                onReset={() => setSubmitted(null)}
              />
            ) : (
              <CheckForm onDone={setSubmitted} />
            )}
          </div>
        </div>
        <ol className="flex flex-col gap-3.5">
          {STEPS.map((step, index) => (
            <li key={step} className="flex items-center gap-3.5">
              <span className="caption-style bg-muted text-fg-secondary shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full tabular-nums">
                {index + 1}
              </span>
              <p className="text-fg-secondary">{step}</p>
            </li>
          ))}
        </ol>
      </main>
      <footer className="border-border border-t">
        <p className="caption-style text-fg-tertiary mx-auto w-full max-w-6xl px-5 py-6 leading-snug sm:px-8">
          We use your details only to follow up on this report. ©{" "}
          {new Date().getFullYear()} Hypedrive.
        </p>
      </footer>
    </div>
  );
}

function CheckForm({ onDone }: { onDone: (submitted: Submitted) => void }) {
  const [form, setForm] = useState({
    url: "",
    name: "",
    email: "",
    phone: "",
    consent: false,
  });
  const [errors, setErrors] = useState<ReviewGapErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const loadedAt = useRef(0);
  const attribution = useRef<Attribution | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadedAt.current = Date.now();
    attribution.current = captureAttribution();
  }, []);

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
    const cleared: string[] =
      key === "email" || key === "phone" ? [key, "contact"] : [key];
    if (cleared.some((field) => field in errors)) {
      const next = { ...errors };
      for (const field of cleared) delete next[field as ReviewGapField];
      setErrors(next);
    }
  }

  function showErrors(found: ReviewGapErrors) {
    setErrors(found);
    const first = FIELD_IDS.find(([field]) => found[field]);
    if (first) {
      requestAnimationFrame(() => document.getElementById(first[1])?.focus());
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    const payload = {
      ...form,
      ...(attribution.current ?? captureAttribution()),
      fax: honeypot.current?.value ?? "",
      elapsedMs: Date.now() - loadedAt.current,
    };
    const check = parseReviewGap(payload);
    if (!check.ok) return showErrors(check.errors);

    setPending(true);
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        errors?: ReviewGapErrors;
        report?: Report;
      };
      if (response.status === 422 && result.errors) {
        return showErrors(result.errors);
      }
      if (!response.ok || !result.ok) {
        setFormError(
          response.status === 429
            ? (result.error ?? SERVER_ERROR)
            : SERVER_ERROR,
        );
        return;
      }
      onDone({ report: result.report ?? null });
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setPending(false);
    }
  }

  const contactError = errors.contact;

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="gap-form-title"
      className="bg-card shadow-card relative flex flex-col gap-5 rounded-2xl p-5 sm:p-7"
    >
      <div className="flex flex-col gap-2.5">
        <h2 id="gap-form-title" className="text-lg leading-6 font-semibold">
          Check a listing
        </h2>
        <p className="text-fg-secondary">
          Takes a few seconds. The report shows up right here.
        </p>
      </div>

      <Field
        label="Product link"
        htmlFor="gap-url"
        required
        hint="From Amazon, Flipkart, Myntra, Nykaa, Meesho and other Indian marketplaces."
        error={errors.url}
      >
        <Input
          id="gap-url"
          name="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={form.url}
          onChange={(event) => update("url", event.target.value)}
          placeholder="https://www.amazon.in/…/dp/B0…"
          aria-required
          aria-invalid={errors.url ? true : undefined}
          aria-describedby={describedBy("gap-url", errors.url, true)}
          className={INPUT_CLASS}
        />
      </Field>

      <Field label="Your name" htmlFor="gap-name">
        <Input
          id="gap-name"
          name="name"
          autoComplete="name"
          value={form.name}
          onChange={(event) => update("name", event.target.value)}
          className={INPUT_CLASS}
        />
      </Field>

      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={
          contactError ? "gap-contact-error" : "gap-contact-hint"
        }
      >
        <legend className="sr-only">Where should we send the report?</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work email" htmlFor="gap-email" error={errors.email}>
            <Input
              id="gap-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              value={form.email}
              onChange={(event) => update("email", event.target.value)}
              placeholder="you@yourbrand.in"
              aria-invalid={errors.email || contactError ? true : undefined}
              aria-describedby={describedBy("gap-email", errors.email)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field
            label="Phone or WhatsApp"
            htmlFor="gap-phone"
            error={errors.phone}
          >
            <Input
              id="gap-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={form.phone}
              onChange={(event) => update("phone", event.target.value)}
              placeholder="98200 12345"
              aria-invalid={errors.phone || contactError ? true : undefined}
              aria-describedby={describedBy("gap-phone", errors.phone)}
              className={cn(INPUT_CLASS, "tabular-nums")}
            />
          </Field>
        </div>
        {contactError ? (
          <span
            id="gap-contact-error"
            role="alert"
            className="caption-style text-danger leading-snug"
          >
            {contactError}
          </span>
        ) : (
          <span
            id="gap-contact-hint"
            className="caption-style text-fg-tertiary leading-snug"
          >
            Add at least one so a specialist can follow up.
          </span>
        )}
      </fieldset>

      <div
        aria-hidden
        className="absolute -left-[9999px] size-px overflow-hidden"
      >
        <label htmlFor="gap-fax">Fax</label>
        <input
          ref={honeypot}
          id="gap-fax"
          name="fax"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Checkbox
            id="gap-consent"
            checked={form.consent}
            onCheckedChange={(checked) => update("consent", checked === true)}
            aria-required
            aria-invalid={errors.consent ? true : undefined}
            aria-describedby={errors.consent ? "gap-consent-error" : undefined}
            className="mt-0.5"
          />
          <label
            htmlFor="gap-consent"
            className="p-style text-fg-secondary cursor-pointer leading-snug select-none"
          >
            {REVIEW_GAP_CONSENT}
          </label>
        </div>
        {errors.consent && (
          <span
            id="gap-consent-error"
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

      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={pending}
        className="h-11 w-full text-sm"
      >
        {pending ? "Reading your listing…" : "Check my listing"}
      </Button>
    </form>
  );
}

function ReportCard({
  submitted,
  onReset,
}: {
  submitted: Submitted;
  onReset: () => void;
}) {
  const { report } = submitted;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const actions = (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        variant="primary"
        size="md"
        href="/demo"
        className="h-11 flex-1 text-sm"
      >
        Talk to a specialist
      </Button>
      <Button
        variant="secondary"
        size="md"
        onClick={onReset}
        className="h-11 flex-1 text-sm"
      >
        Check another listing
      </Button>
    </div>
  );

  if (!report || !report.score || !report.benchmark) {
    return (
      <section
        aria-labelledby="gap-report-title"
        className="bg-card shadow-card flex flex-col gap-5 rounded-2xl p-5 sm:p-7"
      >
        <div className="flex items-start gap-3">
          <span className="bg-muted shadow-hairline flex size-7 shrink-0 items-center justify-center rounded-full">
            <AlertIcon aria-hidden className="text-warning size-3.5" />
          </span>
          <div className="flex flex-col gap-2 pt-0.5">
            <h2
              id="gap-report-title"
              ref={heading}
              tabIndex={-1}
              className="text-lg leading-6 font-semibold outline-none"
            >
              {report
                ? "We need more of your category to compare"
                : "We couldn't read that listing right now"}
            </h2>
            <p className="text-fg-secondary leading-relaxed">
              {report
                ? `Your listing has ${formatCount(report.ratingsCount ?? 0)} ratings. We don't track enough products in its category yet to say where the leaders are.`
                : "Marketplaces sometimes block automated reads."}{" "}
              A specialist will send you the full comparison.
            </p>
          </div>
        </div>
        {actions}
      </section>
    );
  }

  const { score, benchmark } = report;
  const ratings = report.ratingsCount ?? 0;
  const percent = Math.min(100, Math.round(score.share * 100));
  const verdict = VERDICT[report.band ?? "cool"];

  return (
    <section
      aria-labelledby="gap-report-title"
      className="bg-card shadow-card flex flex-col gap-6 rounded-2xl p-5 sm:p-7"
    >
      <div className="flex flex-col gap-2.5">
        <span className="flex flex-wrap items-center gap-2">
          <Tag tone={verdict.tone} size="sm">
            {verdict.title}
          </Tag>
          {report.sandbox && (
            <Tag tone="neutral" size="sm">
              Sample data
            </Tag>
          )}
        </span>
        <h2
          id="gap-report-title"
          ref={heading}
          tabIndex={-1}
          className="text-lg leading-6 font-semibold text-balance outline-none"
        >
          {report.title}
        </h2>
        <p className="caption-style text-fg-tertiary">
          {[report.brand, marketplaceName(report.marketplace)]
            .filter(Boolean)
            .join(" · ")}
          {report.rating !== null && ` · Rated ${report.rating}★`}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted flex flex-col gap-1 rounded-xl px-4 py-3">
            <span className="caption-style text-fg-tertiary">Your ratings</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatCount(ratings)}
            </span>
          </div>
          <div className="bg-muted flex flex-col gap-1 rounded-xl px-4 py-3">
            <span className="caption-style text-fg-tertiary">
              Category leaders
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatCount(benchmark.ratings)}
            </span>
          </div>
        </div>
        <SegmentBar
          percent={percent}
          segments={40}
          className="border-overlay-1 h-3 w-full border px-px"
          segmentClassName="h-2"
          trackClassName="bg-overlay-3"
        />
        <p className="caption-style text-fg-secondary tabular-nums">
          {score.gap > 0
            ? `${percent}% of the way: ${formatCount(score.gap)} ratings behind`
            : "Level with the leaders on ratings"}
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {score.reasons.map((reason) => (
          <li key={reason} className="flex items-start gap-2.5">
            <CheckCircleIcon
              aria-hidden
              className="text-fg-tertiary mt-0.5 size-3.5 shrink-0"
            />
            <span className="text-fg-secondary leading-snug">{reason}.</span>
          </li>
        ))}
      </ul>

      {score.gap > 0 && (
        <p className="border-border text-fg-secondary border-t pt-5 leading-relaxed text-pretty">
          Hypedrive closes this gap with real shoppers: creators buy your
          product on the marketplace, every order is verified, and you pay only
          for approved results.
        </p>
      )}

      {actions}
    </section>
  );
}
