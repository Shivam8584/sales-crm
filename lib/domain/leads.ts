import { checkGstin, gstinError } from "./gstin";
import {
  cleanText,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
} from "./normalize";

/** Shown next to the consent checkbox and stored verbatim on every consent record. */
export const CONSENT_TEXT =
  "I agree that Hypedrive may contact me about this request by email, phone or WhatsApp.";

export const DEFAULT_LEAD_SLA_SECONDS = 300;

export const ORDER_BANDS = [
  { value: "pre_launch", label: "Not selling yet" },
  { value: "under_100", label: "Under 100 a month" },
  { value: "100_1k", label: "100 – 1,000 a month" },
  { value: "1k_10k", label: "1,000 – 10,000 a month" },
  { value: "10k_plus", label: "More than 10,000 a month" },
] as const;
export type OrderBand = (typeof ORDER_BANDS)[number]["value"];

/** How a lead entered the CRM; UTM parameters say where the visitor came from. */
export const LEAD_SOURCE_LABEL: Record<string, string> = {
  demo_form: "Demo form",
  manual: "Manual",
  calcom: "Cal.com",
  platform: "Platform",
  prospecting: "Prospecting",
};

export const UTM_KEYS = [
  "source",
  "medium",
  "campaign",
  "term",
  "content",
] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

// Hosts shared by many sellers, so they never identify one company.
const SHARED_HOSTS = [
  "amazon.in",
  "amazon.com",
  "flipkart.com",
  "meesho.com",
  "myntra.com",
  "nykaa.com",
  "ajio.com",
  "jiomart.com",
  "blinkit.com",
  "zeptonow.com",
  "swiggy.com",
  "instagram.com",
  "facebook.com",
  "linktr.ee",
  "myshopify.com",
  "gmail.com",
];

/** The website's host when it identifies the company rather than a marketplace or social profile. */
export function companyDomain(website: string | undefined | null) {
  const host = website ? normalizeDomain(website) : null;
  if (!host) return null;
  const shared = SHARED_HOSTS.some(
    (item) => host === item || host.endsWith(`.${item}`),
  );
  return shared ? null : host;
}

export function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export function orderBandLabel(value: string | undefined) {
  return ORDER_BANDS.find((band) => band.value === value)?.label;
}

export const LEAD_LIMITS = {
  name: 120,
  companyName: 160,
  website: 300,
  message: 2000,
  meta: 500,
  utm: 200,
} as const;

export type LeadSubmission = {
  name: string;
  email?: string;
  phone?: string;
  companyName: string;
  website?: string;
  gstin?: string;
  ordersBand?: OrderBand;
  message?: string;
  utm: Utm;
  referrer?: string;
  landingPage?: string;
};

export type LeadFormField =
  | "name"
  | "contact"
  | "email"
  | "phone"
  | "companyName"
  | "website"
  | "gstin"
  | "ordersBand"
  | "message"
  | "consent";

export type LeadFieldErrors = Partial<Record<LeadFormField, string>>;

function text(value: unknown, max: number) {
  return typeof value === "string" ? cleanText(value.slice(0, max)) : undefined;
}

/**
 * Validates an untrusted demo-form payload. The public form runs it for
 * instant feedback; the HTTP endpoint runs it again as the authority.
 */
export function parseLeadSubmission(
  raw: Record<string, unknown>,
):
  | { ok: true; value: LeadSubmission }
  | { ok: false; errors: LeadFieldErrors } {
  const errors: LeadFieldErrors = {};
  const name = text(raw.name, LEAD_LIMITS.name);
  const companyName = text(raw.companyName, LEAD_LIMITS.companyName);
  const emailRaw = text(raw.email, 254);
  const phoneRaw = text(raw.phone, 24);
  const website = text(raw.website, LEAD_LIMITS.website);
  const gstinRaw = text(raw.gstin, 20);
  const bandRaw = text(raw.ordersBand, 20);
  const message =
    typeof raw.message === "string" ? raw.message.trim() : undefined;

  if (!name) errors.name = "Enter your name.";
  if (!companyName) errors.companyName = "Enter your brand name.";

  const email = emailRaw ? normalizeEmail(emailRaw) : undefined;
  if (email === null) errors.email = "Enter a valid email address.";
  const phone = phoneRaw ? normalizePhone(phoneRaw) : undefined;
  if (phone === null) {
    errors.phone = "Enter a valid mobile number, like 98200 12345.";
  }
  if (!emailRaw && !phoneRaw) {
    errors.contact = "Add a work email or a phone number so we can reach you.";
  }
  if (website && !normalizeDomain(website)) {
    errors.website = "Enter a website or store link, like yourbrand.in.";
  }
  let gstin: string | undefined;
  if (gstinRaw) {
    const check = checkGstin(gstinRaw);
    if (check.ok) gstin = check.gstin;
    else errors.gstin = gstinError(check) ?? "Enter a valid GSTIN.";
  }
  const ordersBand = ORDER_BANDS.find((band) => band.value === bandRaw)?.value;
  if (bandRaw && !ordersBand) errors.ordersBand = "Pick one of the options.";
  if (message && message.length > LEAD_LIMITS.message) {
    errors.message = `Keep the message under ${LEAD_LIMITS.message.toLocaleString("en-IN")} characters.`;
  }
  if (raw.consent !== true) {
    errors.consent = "Tick the box so our team can contact you.";
  }

  if (Object.keys(errors).length > 0 || !name || !companyName) {
    return { ok: false, errors };
  }

  const utmRaw =
    raw.utm && typeof raw.utm === "object"
      ? (raw.utm as Record<string, unknown>)
      : {};
  const utm: Utm = {};
  for (const key of UTM_KEYS) {
    const value = text(utmRaw[key], LEAD_LIMITS.utm);
    if (value) utm[key] = value;
  }

  return {
    ok: true,
    value: {
      name,
      email: email ?? undefined,
      phone: phone ?? undefined,
      companyName,
      website,
      gstin,
      ordersBand,
      message: message || undefined,
      utm,
      referrer: text(raw.referrer, LEAD_LIMITS.meta),
      landingPage: text(raw.landingPage, LEAD_LIMITS.meta),
    },
  };
}
