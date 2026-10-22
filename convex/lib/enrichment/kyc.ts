import { panRoot } from "../../../lib/domain/gstin";
import { normalizePhone } from "../../../lib/domain/normalize";

/**
 * Provider calls and response shaping for enrichment. Nothing here touches the
 * database, so the same code runs inside Convex actions and in plain Node.
 */

export type ProviderMode = "live" | "sandbox" | null;

export type GstResult = {
  isValid: boolean;
  legalName?: string | null;
  tradeName?: string | null;
  status?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pinCode?: string | null;
  businessType?: string | null;
  registrationDate?: string | null;
  providerRef?: string | null;
  error?: string | null;
};

export type DinResult = {
  isValid: boolean;
  phoneNumber?: string | null;
  providerRef?: string | null;
  error?: string | null;
};

/** Authoritative candidates become applied facts; signals become suggestions. */
export type Candidate = {
  field: string;
  value: string;
  strength: "authoritative" | "signal";
  confidence?: number;
  url?: string;
};

export type ProviderReply<T> =
  | { ok: true; data: T; evidence: string }
  | { ok: false; error: string };

type Env = Record<string, string | undefined>;

export const SOURCES = {
  gst: "gst",
  gstSandbox: "gst:sandbox",
  din: "din",
  dinSandbox: "din:sandbox",
} as const;

export const KYC_ENV_HINT =
  "Add the KYC service URL and token in Settings → Integrations (or ENRICHMENT_SANDBOX=1 for local test data).";

export const DIN_PATTERN = /^[0-9]{8}$/;

/** Registry fields, in display order. A field missing from a newer response is stale. */
export const REGISTRY_FIELDS = [
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
] as const;

export const MAX_EVIDENCE = 60_000;
const KYC_TIMEOUT_MS = 20_000;
const DEFAULT_RETRY_SECONDS = 30;

export function providerMode(env: Env): ProviderMode {
  if (env.KYC_BASE_URL && env.KYC_API_TOKEN) return "live";
  if (env.ENRICHMENT_SANDBOX === "1") return "sandbox";
  return null;
}

export function sourceFamily(source: string) {
  return source.split(":")[0];
}

export function clean(value: unknown) {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  return value.trim().replace(/\s+/g, " ") || null;
}

/** Case- and spacing-insensitive; phone numbers compare on their last 10 digits. */
export function sameValue(a: string | null | undefined, b: string) {
  if (!a) return false;
  const phone = /^\+?[\d\s()-]{7,}$/;
  if (phone.test(a) && phone.test(b)) {
    return a.replace(/\D/g, "").slice(-10) === b.replace(/\D/g, "").slice(-10);
  }
  const norm = (value: string) =>
    value.trim().toLowerCase().replace(/\s+/g, " ");
  return norm(a) === norm(b);
}

/** A cancelled or suspended registration still returns its registry record. */
export function isRegistryRecord(result: GstResult | null | undefined) {
  return Boolean(
    result &&
    typeof result === "object" &&
    (result.isValid || clean(result.legalName)),
  );
}

export function gstCandidates(gstin: string, result: GstResult): Candidate[] {
  const candidates: Candidate[] = [
    { field: "gstin", value: gstin, strength: "authoritative" },
    { field: "panRoot", value: panRoot(gstin)!, strength: "authoritative" },
  ];
  const push = (
    field: string,
    value: unknown,
    strength: Candidate["strength"],
  ) => {
    const text = clean(value);
    if (text) candidates.push({ field, value: text, strength });
  };
  push("legalName", result.legalName, "authoritative");
  push("tradeName", result.tradeName, "authoritative");
  push("gstStatus", result.status, "authoritative");
  push("businessType", result.businessType, "authoritative");
  push("registrationDate", result.registrationDate, "authoritative");
  push("address", result.address, "authoritative");
  push("city", result.city, "authoritative");
  push("state", result.state, "authoritative");
  push("pinCode", result.pinCode, "authoritative");
  // Contact details on a GST registration are often the accountant's.
  const phone = clean(result.phone);
  push("phone", phone && (normalizePhone(phone) ?? phone), "signal");
  push("email", result.email, "signal");
  push("name", clean(result.tradeName) ?? result.legalName, "signal");
  return candidates;
}

function evidenceOf(payload: Record<string, unknown>) {
  return JSON.stringify(
    { ...payload, receivedAt: new Date().toISOString() },
    null,
    2,
  ).slice(0, MAX_EVIDENCE);
}

export async function callKyc<T>(
  env: Env,
  path: string,
  body: Record<string, string>,
): Promise<ProviderReply<T>> {
  const base = (env.KYC_BASE_URL ?? "").replace(/\/+$/, "");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KYC_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, application/problem+json",
        Authorization: `Bearer ${env.KYC_API_TOKEN}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    return {
      ok: false,
      error: controller.signal.aborted
        ? "The registry took too long to answer. Try again."
        : "Couldn't reach the KYC service. Try again shortly.",
    };
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  if (!response.ok) return { ok: false, error: problemMessage(response, text) };

  const secret = env.KYC_HMAC_SECRET;
  if (secret) {
    const signature = response.headers.get("X-KYC-Signature");
    if (!signature || !(await signatureMatches(secret, text, signature))) {
      return {
        ok: false,
        error: "The KYC response signature didn't match, so it was discarded.",
      };
    }
  }
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    return { ok: false, error: "The KYC service sent an unreadable response." };
  }
  return {
    ok: true,
    data,
    evidence: evidenceOf({
      provider: "kyc-service",
      endpoint: `POST ${path}`,
      request: body,
      httpStatus: response.status,
      signature: secret ? "verified" : "not checked",
      response: data,
    }),
  };
}

function retrySeconds(header: string | null) {
  const value = header?.trim();
  if (!value) return DEFAULT_RETRY_SECONDS;
  if (/^\d+$/.test(value)) return Number(value);
  const at = Date.parse(value);
  return Number.isNaN(at)
    ? DEFAULT_RETRY_SECONDS
    : Math.max(1, Math.ceil((at - Date.now()) / 1000));
}

export function problemMessage(response: Response, text: string) {
  if (response.status === 429 || response.status === 503) {
    return `Registry busy, retry in ${retrySeconds(response.headers.get("Retry-After"))} s`;
  }
  if (response.status === 401 || response.status === 403) {
    return "The KYC service rejected the API token. Check KYC_API_TOKEN.";
  }
  let problem: { code?: string; title?: string; detail?: string } = {};
  try {
    problem = JSON.parse(text);
  } catch {}
  const code = problem.code ?? "";
  if (code === "kyc.gstin_invalid") {
    return "The GST registry rejected this GSTIN as invalid";
  }
  if (code === "kyc.din_invalid") return "The registry rejected this DIN";
  if (code.endsWith("not_found") || response.status === 404) {
    return code.includes("din") ? "DIN not found" : "GSTIN not found";
  }
  return (
    problem.detail ||
    problem.title ||
    `The KYC service returned an error (HTTP ${response.status})`
  );
}

export async function hmacHex(secret: string, body: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(body)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function signatureMatches(secret: string, body: string, given: string) {
  const expected = await hmacHex(secret, body);
  const actual = given
    .trim()
    .toLowerCase()
    .replace(/^sha256=/, "");
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let index = 0; index < expected.length; index++) {
    diff |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return diff === 0;
}

const SANDBOX_GST: Record<string, GstResult> = {
  "10BSDPG0911J1ZG": {
    isValid: true,
    legalName: "Sandbox Proprietor Gupta",
    tradeName: "Sandbox Kesar Threads",
    status: "Active",
    address: "14 Fraser Road, Dak Bungalow Chowk",
    phone: "+91 98350 01122",
    email: "accounts@sandbox-kesar.example",
    city: "Patna",
    state: "Bihar",
    pinCode: "800001",
    businessType: "Proprietorship",
    registrationDate: "2019-07-01",
    providerRef: "sandbox-gst-0001",
    error: null,
  },
  "29AAACI4798L1ZU": {
    isValid: false,
    legalName: "Sandbox Indigo Commerce Private Limited",
    tradeName: "Sandbox Indigo Home",
    status: "Cancelled",
    address: "3rd Floor, 80 Feet Road, Koramangala 4th Block",
    phone: null,
    email: "gst@sandbox-indigo.example",
    city: "Bengaluru",
    state: "Karnataka",
    pinCode: "560034",
    businessType: "Private Limited Company",
    registrationDate: "2017-07-01",
    providerRef: "sandbox-gst-0002",
    error: null,
  },
};

export const SANDBOX_DIN = "12345678";
const SANDBOX_NOTE =
  "Deterministic test data from the enrichment sandbox, not from a registry.";

export function sandboxGst(gstin: string): ProviderReply<GstResult> {
  const data = SANDBOX_GST[gstin] ?? {
    isValid: false,
    error: "Not in the sandbox data",
  };
  return {
    ok: true,
    data,
    evidence: evidenceOf({
      provider: "sandbox",
      note: SANDBOX_NOTE,
      request: { gstin },
      response: data,
    }),
  };
}

export function sandboxDin(din: string): ProviderReply<DinResult> {
  const data: DinResult =
    din === SANDBOX_DIN
      ? {
          isValid: true,
          phoneNumber: "+91 98450 12345",
          providerRef: "sandbox-din-0001",
          error: null,
        }
      : { isValid: false, error: "Not in the sandbox data" };
  return {
    ok: true,
    data,
    evidence: evidenceOf({
      provider: "sandbox",
      note: SANDBOX_NOTE,
      request: { din },
      response: data,
    }),
  };
}
