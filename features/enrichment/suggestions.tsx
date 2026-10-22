"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import Button from "@/components/_ui/button";
import CountBadge from "@/components/_ui/count-badge";
import { sourceFamily } from "@/convex/lib/enrichment/kyc";
import { readError } from "@/lib/errors";
import { toast } from "@/stores/toast-store";
import { factLabel, isSandboxSource, sourceNote } from "./labels";
import { SandboxBadge } from "./source-badge";

export type Fact = NonNullable<
  FunctionReturnType<typeof api.enrichment.forAccount>
>["facts"][number];

function reason(fact: Fact, current: string | null | undefined) {
  if (current) return `On record: ${current}`;
  if (sourceFamily(fact.source) === "gst" && /phone|email/.test(fact.field)) {
    return "GST contact details often belong to an accountant";
  }
  if (sourceFamily(fact.source) === "din") {
    return "Registered against the director's DIN";
  }
  if (sourceFamily(fact.source) === "website") {
    return fact.field === "gstin"
      ? "Printed on the company's website"
      : "Taken from the company's website";
  }
  return "Needs a person to confirm";
}

/** Pending suggestions with Accept and Reject; both can be undone from the toast. */
export function Suggestions({
  facts,
  currentValue,
  display = (_, value) => value,
}: {
  facts: Fact[];
  currentValue?: (field: string) => string | null | undefined;
  display?: (field: string, value: string) => string;
}) {
  const decide = useMutation(api.enrichment.decide);
  const undo = useMutation(api.enrichment.undoDecision);
  const [pending, setPending] = useState<string | null>(null);
  if (facts.length === 0) return null;

  async function act(fact: Fact, decision: "accept" | "reject") {
    setPending(`${fact._id}:${decision}`);
    try {
      const receipt = await decide({ factId: fact._id, decision });
      const label = factLabel(fact.field);
      toast(
        decision === "accept"
          ? receipt.record
            ? `${label} updated`
            : `${label} accepted`
          : `${label} suggestion rejected`,
        () =>
          void undo(receipt).catch((error) =>
            toast(readError(error).message, { tone: "danger" }),
          ),
      );
    } catch (error) {
      toast(readError(error, "Couldn't save that decision").message, {
        tone: "danger",
      });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="flex flex-col gap-2" aria-label="Suggestions">
      <h3 className="caption-style text-fg-secondary flex items-center gap-1.5 font-medium">
        Suggestions
        <CountBadge>{facts.length}</CountBadge>
      </h3>
      <ul className="flex flex-col gap-2">
        {facts.map((fact) => {
          const label = factLabel(fact.field);
          const value = display(fact.field, fact.value);
          const current = currentValue?.(fact.field);
          return (
            <li
              key={fact._id}
              className="bg-card shadow-hairline flex flex-col gap-2 rounded-lg px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <span className="caption-style text-fg-tertiary flex flex-wrap items-center gap-1.5">
                  {label} · {sourceNote(fact.source, fact.confidence)}
                  {isSandboxSource(fact.source) && <SandboxBadge />}
                </span>
                <span className="text-foreground text-sm leading-snug font-medium break-words">
                  {value}
                </span>
                <span className="caption-style text-fg-tertiary leading-snug break-words">
                  {reason(fact, current && display(fact.field, current))}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <Button
                  variant="ghost"
                  size="xs"
                  loading={pending === `${fact._id}:reject`}
                  disabled={pending !== null}
                  onClick={() => void act(fact, "reject")}
                  aria-label={`Reject ${label} ${value}`}
                >
                  Reject
                </Button>
                <Button
                  variant="subtle"
                  size="xs"
                  loading={pending === `${fact._id}:accept`}
                  disabled={pending !== null}
                  onClick={() => void act(fact, "accept")}
                  aria-label={`Accept ${label} ${value}`}
                >
                  Accept
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
