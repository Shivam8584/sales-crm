"use client";

import { useId, useState, type FormEvent } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import Skeleton from "@/components/_ui/skeleton";
import Tooltip from "@/components/_ui/tooltip";
import { DetailSection } from "@/components/record/detail";
import {
  DIN_PATTERN,
  SANDBOX_DIN,
  sourceFamily,
} from "@/convex/lib/enrichment/kyc";
import { formatPhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { Evidence } from "./evidence";
import { maskDin, requestedValue } from "./labels";
import { RunNotice } from "./run-notice";
import { SourceBadge } from "./source-badge";
import { Suggestions } from "./suggestions";

/** Looks up a director's DIN and offers the registered phone as a suggestion. */
export default function DinLookup({
  personId,
  className,
  divider,
}: {
  personId: Id<"people">;
  className?: string;
  divider?: boolean;
}) {
  const id = useId();
  const data = useQuery(api.enrichment.forPerson, { personId });
  const config = useQuery(api.enrichment.config, {});
  const lookup = useAction(api.enrichment.lookupDin);
  const [din, setDin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  if (data === null) return null;
  const loading = data === undefined || config === undefined;
  const unconfigured = config?.din === null;
  const valid = DIN_PATTERN.test(din);
  const facts = (data?.facts ?? []).filter(
    (fact) => sourceFamily(fact.source) === "din",
  );
  const suggestions = facts.filter((fact) => fact.status === "suggested");
  const confirmed = facts.find(
    (fact) =>
      (fact.status === "applied" || fact.status === "accepted") &&
      fact.field === "phone",
  );
  const latest = facts[0];
  const lookedUp = latest ? requestedValue(latest.evidence, "din") : null;
  const lastRun = data?.runs.find(
    (run) => sourceFamily(run.provider) === "din",
  );
  const running = lastRun?.status === "running";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      setError("A DIN has 8 digits");
      return;
    }
    if (unconfigured || busy || running) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await lookup({ personId, din });
      if (outcome.ok) setDin("");
    } catch (caught) {
      setError(readError(caught, "Couldn't start the lookup").message);
    } finally {
      setBusy(false);
    }
  }

  const button = (
    <Button
      type="submit"
      variant="secondary"
      size="md"
      loading={busy}
      disabled={!valid || loading || unconfigured || running}
      className="h-9 px-3.5"
    >
      Look up
    </Button>
  );
  const hint = error
    ? error
    : config?.din === "sandbox"
      ? `Sandbox: ${SANDBOX_DIN} returns a test number.`
      : "The phone registered with the DIN arrives as a suggestion.";

  return (
    <DetailSection
      title="Director lookup"
      className={cn("gap-3", className)}
      divider={divider}
    >
      {loading ? (
        <div aria-busy className="flex flex-col gap-2.5">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-3 w-48" />
        </div>
      ) : (
        <>
          <form onSubmit={submit} noValidate className="flex flex-col gap-2">
            <Label htmlFor={`${id}-din`} className="sr-only">
              Director identification number (DIN)
            </Label>
            <div className="flex gap-2">
              <Input
                id={`${id}-din`}
                value={din}
                onChange={(event) => {
                  setDin(event.target.value.replace(/\D/g, "").slice(0, 8));
                  setError(null);
                }}
                inputMode="numeric"
                autoComplete="off"
                placeholder="8-digit DIN"
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={`${id}-hint`}
                className="aria-invalid:border-danger font-mono tracking-wide tabular-nums placeholder:font-sans placeholder:tracking-normal"
              />
              {unconfigured ? (
                <Tooltip
                  content={`DIN lookup isn't configured. ${config!.envHint}`}
                  className="max-w-72 leading-snug"
                >
                  <span
                    tabIndex={0}
                    aria-label={`Look up is unavailable. DIN lookup isn't configured. ${config!.envHint}`}
                    className="focus-visible:ring-ring inline-flex rounded-full outline-none focus-visible:ring-2"
                  >
                    {button}
                  </span>
                </Tooltip>
              ) : (
                button
              )}
            </div>
            <span
              id={`${id}-hint`}
              aria-live="polite"
              className={cn(
                "caption-style block leading-snug",
                error ? "text-danger" : "text-fg-tertiary",
              )}
            >
              {hint}
            </span>
          </form>
          <RunNotice
            run={lastRun}
            runningLabel="Checking the director registry…"
          />
          {confirmed && (
            <div className="flex flex-col gap-1.5">
              <span className="caption-style text-fg-tertiary">
                {confirmed.status === "accepted"
                  ? "Phone confirmed from the DIN"
                  : "Phone on record matches the DIN"}
              </span>
              <span className="text-sm tabular-nums">
                {formatPhone(confirmed.value)}
              </span>
              <SourceBadge
                source={confirmed.source}
                observedAt={confirmed.observedAt}
                confidence={confirmed.confidence}
                note={
                  confirmed.decidedBy
                    ? `Accepted by ${confirmed.decidedBy}`
                    : undefined
                }
              />
            </div>
          )}
          <Suggestions
            facts={suggestions}
            currentValue={(field) =>
              field === "phone" ? data!.person.phone : undefined
            }
            display={(field, value) =>
              field === "phone" ? formatPhone(value) : value
            }
          />
          {latest && lookedUp && (
            <div className="flex flex-col gap-1">
              <div className="caption-style text-fg-tertiary flex h-6 items-center gap-1.5">
                <span>
                  Looked up DIN{" "}
                  <span className="text-fg-secondary font-mono tracking-wide tabular-nums">
                    {revealed ? lookedUp : maskDin(lookedUp)}
                  </span>
                </span>
                <Button
                  variant="link"
                  size="none"
                  className="caption-style text-fg-secondary"
                  aria-pressed={revealed}
                  aria-label={revealed ? "Hide DIN" : "Show DIN"}
                  onClick={() => setRevealed((value) => !value)}
                >
                  {revealed ? "Hide" : "Show"}
                </Button>
              </div>
              <Evidence
                evidence={
                  revealed
                    ? latest.evidence
                    : latest.evidence.split(lookedUp).join(maskDin(lookedUp))
                }
              />
            </div>
          )}
        </>
      )}
    </DetailSection>
  );
}
