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
import { DetailSection } from "@/components/record/detail";
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

/** Verified registry details (GST) in the account sidebar and peek. */
export default function AccountVerification({
  accountId,
  className,
  divider,
}: {
  accountId: Id<"accounts">;
  className?: string;
  divider?: boolean;
}) {
  const data = useQuery(api.enrichment.forAccount, { accountId });
  const config = useQuery(api.enrichment.config, {});

  if (data === null) return null;
  const loading = data === undefined || config === undefined;

  return (
    <DetailSection
      title="Verified details"
      className={cn("gap-2", className)}
      divider={divider}
    >
      {loading ? (
        <div aria-busy className="flex flex-col gap-2.5 py-1">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-56" />
        </div>
      ) : (
        <Verification accountId={accountId} data={data} config={config} />
      )}
    </DetailSection>
  );
}

function registryFacts(data: Data) {
  const registry = new Map<string, Fact>();
  for (const fact of data.facts) {
    if (sourceFamily(fact.source) !== "gst") continue;
    if (fact.status === "applied" || fact.status === "accepted") {
      if (!registry.has(fact.field)) registry.set(fact.field, fact);
    }
  }
  return registry;
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
  const [editing, setEditing] = useState(false);
  const registry = registryFacts(data);
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
  const running = lastRun?.status === "running";
  const accountGstin = data.account.gstin;
  const current =
    gstinFact && accountGstin === gstinFact.value ? gstinFact : undefined;

  return (
    <div className="flex flex-col gap-3">
      {current && !editing ? (
        <VerifiedGstin
          accountId={accountId}
          fact={current}
          status={registry.get("gstStatus")?.value}
          running={running}
          config={config}
          onChange={() => setEditing(true)}
        />
      ) : (
        <GstinForm
          key={accountGstin ?? ""}
          accountId={accountId}
          initial={accountGstin ?? ""}
          verified={gstinFact}
          running={running}
          config={config}
          onDone={() => setEditing(false)}
          onCancel={current ? () => setEditing(false) : undefined}
        />
      )}
      <RunNotice run={lastRun} runningLabel="Checking the GST registry…" />
      {gstinFact && (
        <RegistryDetails
          registry={registry}
          gstinFact={gstinFact}
          accountGstin={accountGstin}
          showMeta={!current || editing}
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
    </div>
  );
}

function VerifiedGstin({
  accountId,
  fact,
  status,
  running,
  config,
  onChange,
}: {
  accountId: Id<"accounts">;
  fact: Fact;
  status: string | undefined;
  running: boolean;
  config: Config;
  onChange: () => void;
}) {
  const verify = useAction(api.enrichment.verifyGst);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inactive = status ? isInactiveGstStatus(status) : false;

  async function reverify() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await verify({ accountId, gstin: fact.value });
      if (outcome.ok) toast("GSTIN re-verified");
    } catch (caught) {
      setError(readError(caught, "Couldn't start the lookup").message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dl className="flex flex-col">
      <Property
        label="GSTIN"
        action={
          <Tooltip
            content={
              config.gst === null
                ? `GST lookup isn't configured. ${config.envHint}`
                : `Last verified ${relativeTime(fact.observedAt)}`
            }
            className="max-w-72 leading-snug"
          >
            <Button
              variant="ghost"
              size="xs"
              loading={busy}
              disabled={running || config.gst === null}
              onClick={() => void reverify()}
            >
              Re-verify
            </Button>
          </Tooltip>
        }
      >
        <button
          type="button"
          onClick={onChange}
          aria-label={`Change GSTIN ${fact.value}`}
          className="hover:bg-overlay-1 focus-visible:ring-ring -mx-1.5 flex h-7 min-w-0 items-center gap-2 rounded-md px-1.5 outline-none focus-visible:ring-2"
        >
          <span className="truncate font-mono text-xs tabular-nums">
            {fact.value}
          </span>
        </button>
      </Property>
      {status && (
        <Property label="GST status">
          <Tag tone={inactive ? "red" : "green"} size="xs">
            {status}
          </Tag>
        </Property>
      )}
      <Property label="Source">
        <SourceBadge source={fact.source} observedAt={fact.observedAt} />
      </Property>
      {error && (
        <p role="alert" className="caption-style text-danger leading-snug">
          {error}
        </p>
      )}
    </dl>
  );
}

function GstinForm({
  accountId,
  initial,
  verified,
  running,
  config,
  onDone,
  onCancel,
}: {
  accountId: Id<"accounts">;
  initial: string;
  verified: Fact | undefined;
  running: boolean;
  config: Config;
  onDone: () => void;
  onCancel?: () => void;
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
      if (outcome.ok) {
        toast(reverify ? "GSTIN re-verified" : "GSTIN verified");
        onDone();
      }
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
          autoFocus={Boolean(onCancel)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && onCancel) {
              event.stopPropagation();
              onCancel();
            }
          }}
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
      {onCancel && (
        <Button
          variant="ghost"
          size="xs"
          className="-ml-2 w-fit"
          onClick={onCancel}
        >
          Cancel
        </Button>
      )}
    </form>
  );
}

function RegistryDetails({
  registry,
  gstinFact,
  accountGstin,
  showMeta,
}: {
  registry: Map<string, Fact>;
  gstinFact: Fact;
  accountGstin: string | null;
  /** Status and source, when the compact GSTIN row above isn't showing them. */
  showMeta: boolean;
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
    state,
  ]
    .filter(Boolean)
    .join(", ");
  const registered = value("registrationDate");
  const legalName = value("legalName");
  const tradeName = value("tradeName");
  const differs = (fact: Fact | undefined) =>
    fact &&
    (fact.status === "accepted" ||
      fact.source !== gstinFact.source ||
      fact.observedAt !== gstinFact.observedAt);

  const text = (content?: string) =>
    content ? (
      <span className="py-1.5 text-sm leading-snug break-words">{content}</span>
    ) : null;
  const rows: { field: string; label: string; content: ReactNode }[] = [
    {
      field: "gstStatus",
      label: "GST status",
      content:
        showMeta && status ? (
          <Tag tone={inactive ? "red" : "green"} size="xs">
            {status}
          </Tag>
        ) : null,
    },
    {
      field: "source",
      label: "Source",
      content: showMeta ? (
        <SourceBadge
          source={gstinFact.source}
          observedAt={gstinFact.observedAt}
        />
      ) : null,
    },
    { field: "legalName", label: "Legal name", content: text(legalName) },
    {
      field: "tradeName",
      label: "Trade name",
      content: tradeName !== legalName ? text(tradeName) : null,
    },
    {
      field: "businessType",
      label: "Constitution",
      content: text(value("businessType")),
    },
    {
      field: "registrationDate",
      label: "Registered",
      content: text(registered && formatRegistryDate(registered)),
    },
    { field: "address", label: "Address", content: text(address) },
    {
      field: "panRoot",
      label: "PAN",
      content: pan ? (
        <Tooltip content="Shared by every GSTIN of this entity">
          <span
            tabIndex={0}
            className="focus-visible:ring-ring rounded-sm font-mono text-[13px] tracking-wide outline-none focus-visible:ring-2"
          >
            {pan}
          </span>
        </Tooltip>
      ) : null,
    },
  ];
  for (const field of ["phone", "email"]) {
    const fact = registry.get(field);
    if (fact?.status !== "accepted") continue;
    rows.push({
      field,
      label: field === "phone" ? "Phone" : "Email",
      content: text(field === "phone" ? formatPhone(fact.value) : fact.value),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {stale && (
        <p className="caption-style text-warning leading-snug">
          {accountGstin
            ? "The GSTIN changed. Verify it to replace the details below, which are for "
            : "The GSTIN was removed. The details below are for "}
          <span className="font-mono tracking-wide">{gstinFact.value}</span>.
        </p>
      )}
      {inactive && (
        <p className="caption-style text-danger flex gap-1.5 leading-snug">
          <AlertIcon aria-hidden className="mt-px size-3 shrink-0" />
          <span>
            This registration is {status!.toLowerCase()}. Confirm with the
            account before invoicing.
          </span>
        </p>
      )}
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
      <Evidence evidence={gstinFact.evidence} label="Registry response" />
    </div>
  );
}
