export const FIELDS = [
  "gstin",
  "panRoot",
  "legalName",
  "tradeName",
  "gstStatus",
  "businessType",
  "registrationDate",
  "address",
  "city",
  "state",
  "pinCode",
  "phone",
  "email",
  "name",
  "siteDescription",
] as const;
export type Field = (typeof FIELDS)[number];

export const CONFIDENT = 0.8;

/** Values a person should confirm before they replace what the record says. */
const CONFIRM_FIELDS: ReadonlySet<string> = new Set([
  "gstin",
  "name",
  "phone",
  "email",
]);

export function needsConfirmation(field: string, confidence: number) {
  return confidence < CONFIDENT && CONFIRM_FIELDS.has(field);
}

export function confidenceBand(confidence: number) {
  if (confidence >= 0.9) return "high";
  return confidence >= 0.7 ? "medium" : "low";
}

export type Found = {
  value: string;
  confidence: number;
  source: string;
  url?: string;
  fetchedAt: number;
};

export type LookupInput = {
  gstin?: string;
  din?: string;
  domain?: string;
  platform?: { legalName?: string };
};

export type PageMeta = {
  url: string;
  title?: string;
  siteName?: string;
  description?: string;
  canonical?: string;
  gstins: string[];
};

export type PageReply =
  | { ok: true; page: PageMeta }
  | { ok: false; error: string };

export type LookupContext = {
  env: Record<string, string | undefined>;
  homepage: (url: string) => Promise<PageReply>;
};

export type Provider = {
  id: string;
  label: string;
  fields: readonly Field[];
  isConfigured(env: LookupContext["env"]): boolean;
  /** Why this provider can't run on the input, if it can't. */
  needs(input: LookupInput): string | null;
  lookup(
    input: LookupInput,
    context: LookupContext,
  ): Promise<{
    values: Partial<Record<Field, Found>>;
    /** Text kept beside the facts as proof of where they came from. */
    evidence?: string;
    raw?: never;
  }>;
};

/** A provider failure whose message is safe to show to a rep. */
export class ProviderFailure extends Error {}

export type Attempt = {
  provider: string;
  status: "ok" | "skipped" | "failed";
  ms: number;
  note?: string;
};

export type Winner = Found & { provider: string; evidence: string };

export const DEFAULT_ORDER = ["gst", "platform", "website"] as const;

/** An unreadable or empty ENRICHMENT_ORDER falls back to the default chain. */
export function parseOrder(
  raw: string | undefined,
  known: readonly string[],
  fallback: readonly string[] = DEFAULT_ORDER,
) {
  const ids: string[] = [];
  for (const part of (raw ?? "").split(",")) {
    const id = part.trim().toLowerCase();
    if (known.includes(id) && !ids.includes(id)) ids.push(id);
  }
  return ids.length > 0 ? ids : [...fallback];
}

function valid(found: Found | undefined): found is Found {
  return Boolean(
    found &&
    typeof found.value === "string" &&
    found.value.trim() &&
    Number.isFinite(found.confidence) &&
    found.confidence >= 0 &&
    found.confidence <= 1,
  );
}

/** Highest confidence wins; on a tie the value seen first (earlier provider) stays. */
export function mergeWinners(
  winners: Partial<Record<Field, Winner>>,
  provider: string,
  evidence: string,
  values: Partial<Record<Field, Found>>,
  allowed: readonly Field[],
) {
  for (const field of allowed) {
    const found = values[field];
    if (!valid(found)) continue;
    const current = winners[field];
    if (!current || found.confidence > current.confidence) {
      winners[field] = { ...found, provider, evidence };
    }
  }
}

function unmet(
  wanted: readonly Field[],
  winners: Partial<Record<Field, Winner>>,
) {
  return wanted.filter(
    (field) => (winners[field]?.confidence ?? 0) < CONFIDENT,
  );
}

/**
 * Tries providers in order until every wanted field has a confident value.
 * A provider that fails, or has nothing to add, never stops the chain.
 */
export async function runWaterfall(args: {
  providers: readonly Provider[];
  input: LookupInput;
  wanted: readonly Field[];
  context: LookupContext;
  now?: () => number;
}) {
  const { providers, input, wanted, context } = args;
  const now = args.now ?? Date.now;
  const attempts: Attempt[] = [];
  const winners: Partial<Record<Field, Winner>> = {};

  for (const provider of providers) {
    const missing = unmet(wanted, winners);
    if (missing.length === 0) break;
    const skip = (note: string) =>
      attempts.push({ provider: provider.id, status: "skipped", ms: 0, note });

    if (!provider.isConfigured(context.env)) {
      skip("Not configured");
      continue;
    }
    if (!provider.fields.some((field) => missing.includes(field))) {
      skip("Nothing left it could add");
      continue;
    }
    const reason = provider.needs(input);
    if (reason) {
      skip(reason);
      continue;
    }

    const started = now();
    try {
      const result = await provider.lookup(input, context);
      const evidence =
        result.evidence ??
        `${provider.label}, ${new Date(now()).toISOString()}`;
      mergeWinners(
        winners,
        provider.id,
        evidence,
        result.values,
        provider.fields,
      );
      const found = Object.values(result.values).filter(valid).length;
      attempts.push({
        provider: provider.id,
        status: "ok",
        ms: now() - started,
        ...(found === 0 ? { note: "Nothing found" } : {}),
      });
    } catch (error) {
      if (!(error instanceof ProviderFailure)) {
        console.error(`Enrichment provider ${provider.id} failed`, error);
      }
      attempts.push({
        provider: provider.id,
        status: "failed",
        ms: now() - started,
        note:
          error instanceof ProviderFailure
            ? error.message
            : "Failed unexpectedly",
      });
    }
  }
  return { attempts, winners };
}
