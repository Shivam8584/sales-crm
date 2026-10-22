import type { LeadKind } from "./enums";

export const HOT_MIN = 70;
export const WARM_MIN = 40;

const KIND_DEMO = 35;
const KIND_SIGNUP = 25;
const KIND_CONTACT = 15;
const KIND_MANUAL = 10;
const CHANNEL_PAID = 15;
const CHANNEL_REFERRED = 6;
const LANDING_DEMO_PAGE = 5;
const EMAIL_COMPANY = 10;
const WEBSITE = 8;
const GSTIN_GIVEN = 10;
const GSTIN_VERIFIED = 18;
const COMPANY_NAMED = 4;
const MESSAGE_DETAILED = 4;
const MESSAGE_INTENT_PER_WORD = 5;
const MESSAGE_INTENT_MAX = 10;
const REPEAT_SUBMISSION = 8;
const PLATFORM_ORG = 15;
const PLATFORM_USER = 8;

const DETAILED_MESSAGE_CHARS = 80;
const MAX_REASONS = 4;

const INTENT_WORDS = ["demo", "pricing", "price", "budget", "campaign"];
const PAID_MEDIUMS = /^(cpc|ppc|paid|paidsearch|paid_search|sem)$/i;

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.in",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "rediffmail.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
]);

export type EmailType = "company" | "free";

export type LeadFacts = {
  kind: LeadKind;
  source: string;
  utm: Partial<Record<"source" | "medium", string>>;
  referrer?: string;
  landingPage?: string;
  name?: string;
  email?: string;
  website?: string;
  gstin?: string;
  gstVerified?: boolean;
  companyName?: string;
  message?: string;
  repeats?: number;
  platform?: "org" | "user" | null;
};

export type LeadBand = "hot" | "warm" | "cold";

export type LeadScore = {
  score: number;
  band: LeadBand;
  reasons: string[];
};

export function emailType(email: string | undefined | null): EmailType | null {
  const domain = email?.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  return FREE_EMAIL_DOMAINS.has(domain) ? "free" : "company";
}

export function scoreBand(score: number): LeadBand {
  return score >= HOT_MIN ? "hot" : score >= WARM_MIN ? "warm" : "cold";
}

const KIND_POINTS: Record<LeadKind, [number, string]> = {
  demo: [KIND_DEMO, "Demo request"],
  signup: [KIND_SIGNUP, "Platform signup"],
  contact: [KIND_CONTACT, "Contact form"],
  manual: [KIND_MANUAL, "Added by the team"],
};

export function scoreLead(facts: LeadFacts): LeadScore {
  const parts: [number, string][] = [KIND_POINTS[facts.kind]];
  const add = (points: number, reason: string) => parts.push([points, reason]);

  const medium = facts.utm.medium?.trim();
  if (medium && PAID_MEDIUMS.test(medium)) add(CHANNEL_PAID, "Paid search");
  else if (facts.utm.source || facts.referrer) {
    add(CHANNEL_REFERRED, "Came from a campaign or referral");
  }
  if (/\/(demo|book)/i.test(facts.landingPage ?? "")) {
    add(LANDING_DEMO_PAGE, "From the demo page");
  }

  if (emailType(facts.email) === "company") add(EMAIL_COMPANY, "Company email");
  if (facts.website) add(WEBSITE, "Has a website");
  if (facts.gstin) {
    if (facts.gstVerified) add(GSTIN_VERIFIED, "GST verified");
    else add(GSTIN_GIVEN, "GSTIN given");
  }
  const company = facts.companyName?.trim().toLowerCase();
  if (company && company !== facts.name?.trim().toLowerCase()) {
    add(COMPANY_NAMED, "Named company");
  }

  const message = facts.message?.toLowerCase() ?? "";
  const words = INTENT_WORDS.filter((word) =>
    new RegExp(`\\b${word}`).test(message),
  );
  if (words.length > 0) {
    add(
      Math.min(MESSAGE_INTENT_MAX, words.length * MESSAGE_INTENT_PER_WORD),
      `Mentions ${words.slice(0, 2).join(", ")}`,
    );
  }
  if (message.length >= DETAILED_MESSAGE_CHARS) {
    add(MESSAGE_DETAILED, "Detailed message");
  }
  if ((facts.repeats ?? 0) > 0) add(REPEAT_SUBMISSION, "Submitted again");

  if (facts.platform === "org") add(PLATFORM_ORG, "Created a platform org");
  else if (facts.platform === "user")
    add(PLATFORM_USER, "Has a platform login");

  const score = Math.min(
    100,
    parts.reduce((sum, [points]) => sum + points, 0),
  );
  const reasons = parts
    .map((part, index) => ({ part, index }))
    .sort((a, b) => b.part[0] - a.part[0] || a.index - b.index)
    .slice(0, MAX_REASONS)
    .map(({ part }) => part[1]);
  return { score, band: scoreBand(score), reasons };
}

export const DEFAULT_HOT_SLA_FACTOR = 0.5;
export const HOT_SLA_PERCENT = { min: 10, max: 100 } as const;

/** The first-touch window for a lead: hot leads get `factor` of the normal one. */
export function leadSlaMs(
  baseMs: number,
  score: number | null | undefined,
  factor: number,
) {
  return score !== null && score !== undefined && score >= HOT_MIN
    ? Math.max(1000, Math.round((baseMs * factor) / 1000) * 1000)
    : baseMs;
}
