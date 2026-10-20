"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useAction, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Button from "@/components/_ui/button";
import { Input } from "@/components/_ui/input";
import { Label } from "@/components/_ui/label";
import Skeleton from "@/components/_ui/skeleton";
import Tag from "@/components/_ui/tag";
import Tooltip from "@/components/_ui/tooltip";
import { Property } from "@/components/record/properties";
import { sourceFamily } from "@/convex/lib/enrichment";
import {
  GSTIN_LENGTH,
  GST_STATES,
  checkGstin,
  gstinError,
  normalizeGstin,
  panRoot,
} from "@/lib/domain/gstin";
import { formatPhone } from "@/lib/domain/normalize";
import { readError } from "@/lib/errors";
import { relativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { toast } from "@/stores/toast-store";
import AlertIcon from "@/public/assets/icons/alert-triangle.svg";
import { Evidence } from "./evidence";
import { formatRegistryDate, isInactiveGstStatus } from "./labels";
import { RunNotice } from "./run-notice";
import { SourceBadge } from "./source-badge";
import { Suggestions, type Fact } from "./suggestions";

type Data = NonNullable<FunctionReturnType<typeof api.enrichment.forAccount>>;
type Config = FunctionReturnType<typeof api.enrichment.config>;

const SUGGESTION_ORDER = ["name", "phone", "email"];

const SANDBOX_HINT =
  "Sandbox: 10BSDPG0911J1ZG is active, 29AAACI4798L1ZU is cancelled.";

/** Verified registry details (GST) shown in the account page sidebar. */
export default function AccountVerification({
  accountId,
}: {
  accountId: Id<"accounts">;
}) {
  const data = useQuery(api.enrichment.forAccount, { accountId });
  const config = useQuery(api.enrichment.config, {});
  const headingId = useId();

  if (data === null) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="caption-style text-fg-tertiary font-medium">
        Verified details
      </h2>
      {data === undefined || config === undefined ? (
        <div aria-busy className="flex flex-col gap-2.5">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      ) : (
        <Verification accountId={accountId} data={data} config={config} />
      )}
    </section>
  );
}

function Verification({
  accountId,
  data,
  config,
}: {
  accountId: Id<"accounts">;
  data: Data;
  config: Config;
}) {
  const registry = new Map<string, Fact>();
  for (const fact of data.facts) {
    if (sourceFamily(fact.source) !== "gst") continue;
    if (fact.status === "applied" || fact.status === "accepted") {
      if (!registry.has(fact.field)) registry.set(fact.field, fact);
    }
  }
  const gstinFact = registry.get("gstin");
  const suggestions = data.facts
    .filter(
      (fact) =>
        fact.status === "suggested" && sourceFamily(fact.source) === "gst",
    )
    .sort(
      (a, b) =>
        SUGGESTION_ORDER.indexOf(a.field) - SUGGESTION_ORDER.indexOf(b.field),
    );
  const lastRun = data.runs.find((run) => sourceFamily(run.provider) === "gst");

  return (
    <>
      <GstinForm
        key={data.account.gstin ?? ""}
        accountId={accountId}
        initial={data.account.gstin ?? ""}
        verified={gstinFact}
        running={lastRun?.status === "running"}
        config={config}
      />
      <RunNotice run={lastRun} runningLabel="Checking the GST registry…" />
      {gstinFact && (
        <RegistryDetails
          registry={registry}
          gstinFact={gstinFact}
          accountGstin={data.account.gstin}
        />
      )}
      <Suggestions
        facts={suggestions}
        currentValue={(field) =>
          field === "name" ? data.account.name : undefined
        }
        display={(field, value) =>
          field === "phone" ? formatPhone(value) : value
        }
      />
    </>
  );
}

function GstinForm({
  accountId,
  initial,
  verified,
  running,
  config,
}: {
  accountId: Id<"accounts">;
  initial: string;
  verified: Fact | undefined;
  running: boolean;
  config: Config;
}) {
  const id = useId();
  const verify = useAction(api.enrichment.verifyGst);
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const check = checkGstin(value);
  const unconfigured = config.gst === null;
  const reverify = check.ok && check.gstin === verified?.value;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!check.ok) {
      setError(gstinError(check));
      return;
    }
    if (unconfigured || busy || running) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await verify({ accountId, gstin: check.gstin });
      if (outcome.ok) toast(reverify ? "GSTIN re-verified" : "GSTIN verified");
    } catch (caught) {
      setError(readError(caught, "Couldn't start the lookup").message);
    } finally {
      setBusy(false);
    }
  }

  let status: { tone: "idle" | "ok" | "error"; text: ReactNode } | null = null;
  if (error) {
    status = { tone: "error", text: error };
  } else if (check.ok && reverify && verified) {
    status = {
      tone: "idle",
      text: `Last verified ${relativeTime(verified.observedAt)}`,
    };
  } else if (check.ok) {
    status = {
      tone: "ok",
      text: [
        "Checksum OK",
        GST_STATES[check.gstin.slice(0, 2)],
        `PAN ${panRoot(check.gstin)}`,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  } else if (check.reason === "short") {
    status = {
      tone: "idle",
      text: `${check.gstin.length} of ${GSTIN_LENGTH} characters`,
    };
  } else if (check.reason !== "empty") {
    status = { tone: "error", text: gstinError(check) };
  } else if (config.gst === "sandbox") {
    status = { tone: "idle", text: SANDBOX_HINT };
  }

  const button = (
    <Button
      type="submit"
      variant="secondary"
      size="md"
      loading={busy}
      disabled={!check.ok || unconfigured || running}
      className="h-9 px-3.5"
    >
      {reverify ? "Re-verify" : "Verify"}
    </Button>
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-2">
      <Label htmlFor={`${id}-gstin`} className="sr-only">
        GSTIN to verify
      </Label>
      <div className="flex gap-2">
        <Input
          id={`${id}-gstin`}
          value={value}
          onChange={(event) => {
            setValue(normalizeGstin(event.target.value).slice(0, GSTIN_LENGTH));
            setError(null);
          }}
          placeholder="15-character GSTIN"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={status?.tone === "error" || undefined}
          aria-describedby={status ? `${id}-status` : undefined}
          className="aria-invalid:border-danger font-mono tracking-wide tabular-nums placeholder:font-sans placeholder:tracking-normal"
        />
        {unconfigured ? (
          <Tooltip
            content={`GST lookup isn't configured. ${config.envHint}`}
            className="max-w-72 leading-snug"
          >
            <span
              tabIndex={0}
              aria-label={`Verify is unavailable. GST lookup isn't configured. ${config.envHint}`}
              className="focus-visible:ring-ring inline-flex rounded-full outline-none focus-visible:ring-2"
            >
              {button}
            </span>
          </Tooltip>
        ) : (
          button
        )}
      </div>
      {status && (
        <span
          id={`${id}-status`}
          aria-live="polite"
          className={cn(
            "caption-style block leading-snug",
            status.tone === "error" && "text-danger",
            status.tone === "ok" && "text-success",
            status.tone === "idle" && "text-fg-tertiary",
          )}
        >
          {status.text}
        </span>
      )}
    </form>
  );
}

function RegistryDetails({
  registry,
  gstinFact,
  accountGstin,
}: {
  registry: Map<string, Fact>;
  gstinFact: Fact;
  accountGstin: string | null;
}) {
  const value = (field: string) => registry.get(field)?.value;
  const status = value("gstStatus");
  const inactive = status ? isInactiveGstStatus(status) : false;
  const stale = gstinFact.value !== accountGstin;
  const pan = value("panRoot") ?? panRoot(gstinFact.value);
  const state = value("state") ?? GST_STATES[gstinFact.value.slice(0, 2)];
  const address = [
    value("address"),
    [value("city"), value("pinCode")].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");
  const registered = value("registrationDate");
  const differs = (fact: Fact | undefined) =>
    fact &&
    (fact.status === "accepted" ||
      fact.source !== gstinFact.source ||
      fact.observedAt !== gstinFact.observedAt);

  const text = (field: string, content?: string) =>
    content ? (
      <span className="py-1.5 text-sm leading-snug break-words">{content}</span>
    ) : null;
  const rows: { field: string; label: string; content: ReactNode }[] = [
    {
      field: "gstStatus",
      label: "GST status",
      content: status ? (
        <Tag tone={inactive ? "red" : "green"} size="xs">
          {status}
        </Tag>
      ) : null,
    },
    {
      field: "legalName",
      label: "Legal name",
      content: text("legalName", value("legalName")),
    },
    {
      field: "tradeName",
      label: "Trade name",
      content: text("tradeName", value("tradeName")),
    },
    {
      field: "businessType",
      label: "Constitution",
      content: text("businessType", value("businessType")),
    },
    {
      field: "registrationDate",
      label: "Registered",
      content: text(
        "registrationDate",
        registered && formatRegistryDate(registered),
      ),
    },
    { field: "state", label: "State", content: text("state", state) },
    { field: "address", label: "Address", content: text("address", address) },
    {
      field: "panRoot",
      label: "PAN",
      content: pan ? (
        <span className="flex flex-col gap-1 py-1.5">
          <span className="font-mono text-sm tracking-wide">{pan}</span>
          <span className="caption-style text-fg-tertiary leading-snug">
            Shared by every GSTIN of this entity
          </span>
        </span>
      ) : null,
    },
  ];
  for (const field of ["phone", "email"]) {
    const fact = registry.get(field);
    if (fact?.status !== "accepted") continue;
    rows.push({
      field,
      label: field === "phone" ? "Phone" : "Email",
      content: text(
        field,
        field === "phone" ? formatPhone(fact.value) : fact.value,
      ),
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2">
        {stale && (
          <span className="caption-style text-fg-tertiary">
            Details for{" "}
            <span className="text-fg-secondary font-mono tracking-wide">
              {gstinFact.value}
            </span>
          </span>
        )}
        <SourceBadge
          source={gstinFact.source}
          observedAt={gstinFact.observedAt}
        />
        {stale && (
          <p className="caption-style text-warning leading-snug">
            {accountGstin
              ? "The account's GSTIN has changed. Verify it to replace these details."
              : "The GSTIN was removed from the account."}
          </p>
        )}
        {inactive && (
          <p className="caption-style text-danger flex gap-1.5 leading-snug">
            <AlertIcon aria-hidden className="mt-px size-3 shrink-0" />
            <span>
              This registration is {status!.toLowerCase()} in the GST registry.
              Confirm with the account before invoicing.
            </span>
          </p>
        )}
      </div>
      <dl className="flex flex-col">
        {rows.map((row) => {
          if (!row.content) return null;
          const fact = registry.get(row.field);
          return (
            <Property key={row.field} label={row.label}>
              <span className="flex min-w-0 flex-col items-start">
                {row.content}
                {differs(fact) && (
                  <span className="flex flex-col items-start gap-1 pb-1.5">
                    {fact!.decidedBy && (
                      <span className="caption-style text-fg-tertiary">
                        Accepted by {fact!.decidedBy}
                      </span>
                    )}
                    <SourceBadge
                      source={fact!.source}
                      observedAt={fact!.observedAt}
                    />
                  </span>
                )}
              </span>
            </Property>
          );
        })}
      </dl>
      <Evidence evidence={gstinFact.evidence} />
    </div>
  );
}
