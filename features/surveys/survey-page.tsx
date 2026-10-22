"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Button from "@/components/_ui/button";
import Field from "@/components/_ui/field";
import Skeleton from "@/components/_ui/skeleton";
import { Textarea } from "@/components/_ui/textarea";
import { COMMENT_MAX } from "@/lib/domain/surveys";
import Logo from "@/public/assets/images/_common/logo.svg";

type Info = {
  brandName: string;
  expired: boolean;
  answered: boolean;
};
type Phase = "loading" | "ready" | "thanks" | "expired" | "answered" | "gone";

const BASE = `${process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? ""}/survey`;
const SCORES = Array.from({ length: 11 }, (_, index) => index);
const MESSAGE: Record<Exclude<Phase, "loading" | "ready">, [string, string]> = {
  thanks: [
    "Thank you",
    "Your answer reached the team. It helps us look after you better.",
  ],
  expired: [
    "This link has expired",
    "Survey links stop working after 30 days. If you'd still like to share feedback, reply to the email you got it in.",
  ],
  answered: [
    "Already answered",
    "We have your answer for this survey. Thank you.",
  ],
  gone: [
    "This link isn't valid",
    "It may have been copied incompletely. Try opening it again from the email.",
  ],
};

/** Public one-question NPS survey, opened from an emailed link. */
export default function SurveyPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [brand, setBrand] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${BASE}/info?token=${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return setPhase("gone");
        const info = (await response.json()) as Info;
        setBrand(info.brandName);
        setPhase(
          info.answered ? "answered" : info.expired ? "expired" : "ready",
        );
      })
      .catch((error: unknown) => {
        if ((error as Error).name !== "AbortError") setPhase("gone");
      });
    return () => controller.abort();
  }, [token]);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-2xl items-center gap-2 px-5 sm:px-8">
        <Logo aria-hidden className="size-8 shrink-0 overflow-visible" />
        <span className="lead-style font-medium tracking-[-0.01em]">
          Hypedrive
        </span>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pt-6 pb-16 sm:px-8 sm:pt-10">
        {phase === "loading" ? (
          <div
            className="bg-card shadow-card flex flex-col gap-5 rounded-2xl p-5 sm:p-7"
            aria-busy
          >
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-11 w-full" />
            <Skeleton className="h-18 w-full" />
          </div>
        ) : phase === "ready" ? (
          <SurveyForm
            token={token}
            brand={brand}
            onDone={(next) => setPhase(next)}
          />
        ) : (
          <Notice phase={phase} />
        )}
      </main>
    </div>
  );
}

function Notice({ phase }: { phase: keyof typeof MESSAGE }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const [title, text] = MESSAGE[phase];
  return (
    <div
      role={phase === "thanks" ? "status" : undefined}
      className="bg-card shadow-card flex flex-col gap-2.5 rounded-2xl p-5 sm:p-7"
    >
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-lg leading-6 font-semibold outline-none"
      >
        {title}
      </h1>
      <p className="text-fg-secondary text-pretty">{text}</p>
    </div>
  );
}

function SurveyForm({
  token,
  brand,
  onDone,
}: {
  token: string;
  brand: string;
  onDone: (phase: Phase) => void;
}) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function pick(next: number) {
    setScore(next);
    setError(null);
    buttons.current[next]?.focus();
  }

  function onKeyDown(event: KeyboardEvent) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    pick(((score ?? (step > 0 ? -1 : 11)) + step + 11) % 11);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (score === null) return setError("Pick a score from 0 to 10.");
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`${BASE}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          score,
          comment: comment.trim() || undefined,
        }),
      });
      if (response.ok) return onDone("thanks");
      if (response.status === 410) return onDone("expired");
      if (response.status === 409) return onDone("answered");
      if (response.status === 404) return onDone("gone");
      setError(
        response.status === 429
          ? "Too many attempts. Try again in a minute."
          : "We couldn't save your answer. Try again in a moment.",
      );
    } catch {
      setError(
        "We couldn't save your answer. Check your connection and try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby="survey-question"
      className="bg-card shadow-card flex flex-col gap-5 rounded-2xl p-5 sm:p-7"
    >
      <div className="flex flex-col gap-2.5">
        <h1
          id="survey-question"
          className="text-lg leading-6 font-semibold text-balance"
        >
          How likely are you to recommend Hypedrive to another brand?
        </h1>
        <p className="text-fg-secondary">A quick question for {brand}.</p>
      </div>

      <div className="flex flex-col gap-2">
        <div
          role="radiogroup"
          aria-labelledby="survey-question"
          aria-required
          onKeyDown={onKeyDown}
          className="grid grid-cols-6 gap-2 sm:grid-cols-11"
        >
          {SCORES.map((value) => (
            <Button
              key={value}
              ref={(node) => {
                buttons.current[value] = node;
              }}
              role="radio"
              aria-checked={score === value}
              tabIndex={(score ?? 0) === value ? 0 : -1}
              variant={score === value ? "primary" : "secondary"}
              size="md"
              onClick={() => pick(value)}
              className="h-11 w-full tabular-nums"
            >
              {value}
            </Button>
          ))}
        </div>
        <div className="caption-style text-fg-tertiary flex justify-between">
          <span>0 · Not likely</span>
          <span>Very likely · 10</span>
        </div>
      </div>

      <Field
        label="Anything you'd like to add?"
        htmlFor="survey-comment"
        hint="Optional."
      >
        <Textarea
          id="survey-comment"
          name="comment"
          value={comment}
          maxLength={COMMENT_MAX}
          onChange={(event) => setComment(event.target.value)}
        />
      </Field>

      {error && (
        <p role="alert" className="caption-style text-danger leading-snug">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={pending}
        className="h-11 w-full text-sm"
      >
        Send
      </Button>
    </form>
  );
}
