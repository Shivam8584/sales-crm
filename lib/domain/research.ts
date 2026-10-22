/**
 * What the research agent can learn from the CRM's own history, and when it
 * should look again. Pure: nothing here reads the database or the network.
 */
import { normalizeLinkedin, normalizePhone } from "./normalize";
import { emailType } from "./scoring";

export const RESEARCH_REASONS = [
  "new",
  "stale",
  "job_change",
  "manual",
  "recheck",
] as const;
export type ResearchReason = (typeof RESEARCH_REASONS)[number];

/** Sources of facts the agent writes itself; registry and website facts come from the waterfall. */
export const AGENT_SOURCES = ["email", "note", "contacts"] as const;
export type AgentSource = (typeof AGENT_SOURCES)[number];

/** Person fields the agent may fill, and only while they are empty. */
export const AUTO_FIELDS = ["phone", "title", "linkedinUrl"] as const;

export const DEFAULTS = { dailyCap: 50, staleDays: 30 } as const;
export const LIMITS = {
  dailyCap: { min: 1, max: 1000 },
  staleDays: { min: 7, max: 180 },
} as const;

/** Rows a single dispatcher run leases; with the cron interval this bounds the hourly spend. */
export const BATCH = 5;
export const LEASE_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 3;
/** Per-record AI budget: this much history in, this many tokens out, one call. */
export const SUMMARY_INPUT_CHARS = 6000;
export const SUMMARY_OUTPUT_TOKENS = 300;

const DAY = 24 * 60 * 60_000;
const HOUR = 60 * 60_000;

export type Entry = {
  kind: string;
  direction?: "inbound" | "outbound";
  automated?: boolean;
  actorId?: unknown;
  occurredAt: number;
  subject?: string;
  body?: string;
};

export type Finding = {
  field: string;
  value: string;
  /** Strong findings may fill an empty field; weak ones are suggestions. */
  strong: boolean;
  source: AgentSource;
  confidence: number;
  evidence: string;
  at: number;
};

export type Signature = {
  name: string;
  title?: string;
  company?: string;
  phone?: string;
  linkedin?: string;
  lines: string[];
};

const SIGNOFF =
  /^(?:--+|thanks?(?: you)?(?: (?:&|and) regards)?|(?:(?:with|kind|warm|warmest|best|many) )*(?:regards|wishes)|best|cheers|sincerely|yours (?:sincerely|truly|faithfully)|rgds)$/i;
const SIGNATURE_END =
  /^(?:sent from my |get outlook for|this (?:e-?mail|message)\b|disclaimer\b|confidential|please consider the environment|on .+ wrote:)/i;
const NAME_LINE = /^\p{L}[\p{L}.'-]*(?: \p{L}[\p{L}.'-]*){0,3}$/u;
const TITLE_WORDS =
  /\b(?:founder|co-?founder|owner|proprietor|partner|ceo|cto|cfo|coo|cmo|chief|president|vice president|vp|director|head|manager|lead|executive|officer|consultant|analyst|associate|specialist|coordinator|supervisor|engineer|developer|designer|accountant|buyer|merchandiser|strategist|administrator|assistant|advisor)\b/i;
const COMPANY_WORDS =
  /\b(?:pvt|private|ltd|limited|llp|inc|corp|technologies|solutions|enterprises|industries|traders|ventures)\b/i;
const PHONE = /\+?\d[\d\s().-]{7,17}\d/g;
const PHONE_SKIP = /\b(?:fax|gst|gstin|cin|pan|udyam)\b/i;
const MOBILE_LABEL = /\b(?:m|mob|mobile|cell|c)\b\s*[:.-]/i;
const LINKEDIN = /linkedin\.com\/(?:in|pub)\/[A-Za-z0-9%_-]+/i;
const LEFT_COMPANY =
  /[^.!?\n]*\b(?:no longer (?:with|working (?:at|with)|associated with|part of|employed)|(?:has|have) left (?:the )?(?:company|organi[sz]ation|firm)|ceased to be an? employee)\b[^.!?\n]*/i;

/** The sentence of a reply that says the sender has left the company, if any. */
export const movedOn = (text: string) => LEFT_COMPANY.exec(text)?.[0].trim();

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

const day = (at: number) => new Date(at).toISOString().slice(0, 10);

function phonesIn(text: string) {
  const found: string[] = [];
  for (const match of text.match(PHONE) ?? []) {
    const phone = normalizePhone(match);
    if (phone && !found.includes(phone)) found.push(phone);
  }
  return found;
}

/** The sign-off block of an email: it must open with a name, or nothing is read from it. */
export function parseSignature(body: string): Signature | null {
  const lines = body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\*/g, "").trim());
  let start = -1;
  for (let i = Math.max(0, lines.length - 25); i < lines.length; i++) {
    if (SIGNOFF.test(lines[i].replace(/[\s,.!]+$/, ""))) start = i;
  }
  if (start < 0) return null;

  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (SIGNATURE_END.test(line)) break;
    if (line) block.push(clip(line, 120));
    if (block.length === 8) break;
  }
  const [name, ...rest] = block;
  if (!name || !NAME_LINE.test(name) || TITLE_WORDS.test(name)) return null;

  const signature: Signature = { name, lines: block };
  const mobile = rest.find((line) => MOBILE_LABEL.test(line));
  const numbers = [mobile, ...rest]
    .filter((line): line is string => Boolean(line) && !PHONE_SKIP.test(line!))
    .flatMap(phonesIn);
  signature.phone = numbers[0];
  for (const line of rest) {
    const profile = LINKEDIN.exec(line)?.[0];
    if (profile && !signature.linkedin) {
      signature.linkedin =
        normalizeLinkedin(`https://www.${profile}`) ?? undefined;
      continue;
    }
    if (/[@\d]/.test(line) || line.length > 90) continue;
    if (!signature.title && TITLE_WORDS.test(line)) {
      const [title, company] = line.split(/\s*\|\s*|\s+at\s+|\s+@\s+/i);
      signature.title = title.trim();
      signature.company = company?.trim() || undefined;
    } else if (!signature.company && COMPANY_WORDS.test(line)) {
      signature.company = line;
    }
  }
  return signature;
}

const tokens = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter(Boolean);

/** Whether a signature's name line is this person: the first name, and the last name when it gives one. */
export function nameMatches(
  signed: string,
  person: { firstName: string; lastName: string },
) {
  const said = tokens(signed);
  const first = tokens(person.firstName)[0];
  if (!first || !said.includes(first)) return false;
  const last = tokens(person.lastName).at(-1);
  return said.length < 2 || !last || said.includes(last);
}

const GENERIC = new Set([
  "pvt",
  "private",
  "ltd",
  "limited",
  "llp",
  "inc",
  "india",
  "the",
  "and",
  "co",
]);

/** True when the two names share no word at all; a brand and its legal name usually do. */
export function differentCompany(company: string, known: string[]) {
  const words = (text: string) =>
    tokens(text).filter((word) => word.length > 2 && !GENERIC.has(word));
  const theirs = words(company);
  if (theirs.length === 0 || known.length === 0) return false;
  return !known.some((name) => {
    const ours = words(name);
    return theirs.some((word) =>
      ours.some((other) => other.includes(word) || word.includes(other)),
    );
  });
}

type PersonFacts = {
  firstName: string;
  lastName: string;
  accountName?: string;
  accountDomain?: string;
};

/** Newest-first entries in, the most recent finding per field out. */
export function personFindings(person: PersonFacts, entries: Entry[]) {
  const found = new Map<string, Finding>();
  const add = (finding: Finding) => {
    if (!found.has(finding.field)) found.set(finding.field, finding);
  };
  const known = [
    person.accountName,
    person.accountDomain?.split(".")[0],
  ].filter((name): name is string => Boolean(name));

  for (const entry of entries) {
    const text = entry.body ?? "";
    if (!text) continue;
    const at = entry.occurredAt;
    const from = `${entry.kind === "email" ? `The email "${clip(entry.subject ?? "", 80)}"` : `A ${entry.kind}`} on ${day(at)}`;

    if (entry.kind === "email" && entry.direction === "inbound") {
      const signature = parseSignature(text);
      if (signature) {
        const strong = nameMatches(signature.name, person);
        const evidence = `${from}, signature block:\n${signature.lines.join("\n")}`;
        const base = {
          strong,
          source: "email" as const,
          confidence: strong ? 0.9 : 0.6,
          evidence,
          at,
        };
        if (signature.phone)
          add({ ...base, field: "phone", value: signature.phone });
        if (signature.title)
          add({ ...base, field: "title", value: signature.title });
        if (signature.linkedin)
          add({ ...base, field: "linkedinUrl", value: signature.linkedin });
        if (
          strong &&
          signature.company &&
          differentCompany(signature.company, known)
        ) {
          add({
            ...base,
            strong: false,
            confidence: 0.6,
            field: "employment",
            value: `Now signs emails as ${signature.company}`,
          });
        }
      }
      const left = movedOn(text);
      if (left) {
        add({
          field: "employment",
          value: `May have left ${person.accountName ?? "the company"}`,
          strong: false,
          source: "email",
          confidence: 0.5,
          evidence: `${from}: "${clip(left, 200)}"`,
          at,
        });
      }
      continue;
    }

    if (
      !["note", "call", "meeting"].includes(entry.kind) ||
      entry.automated ||
      entry.actorId === undefined
    )
      continue;
    const base = {
      strong: false,
      source: "note" as const,
      confidence: 0.5,
      at,
    };
    const phones = phonesIn(text);
    if (phones.length === 1) {
      add({
        ...base,
        field: "phone",
        value: phones[0],
        evidence: `${from}, written by a teammate: "${clip(text, 140)}"`,
      });
    }
    const profile = LINKEDIN.exec(text)?.[0];
    const linkedin = profile && normalizeLinkedin(`https://www.${profile}`);
    if (linkedin) {
      add({
        ...base,
        field: "linkedinUrl",
        value: linkedin,
        evidence: `${from}, written by a teammate: "${clip(text, 140)}"`,
      });
    }
  }
  return [...found.values()];
}

/** A shared company address domain on an account that has no website yet. */
export function domainFinding(
  account: { domain?: string },
  emails: string[],
  skip: string[],
  at: number,
): Finding | null {
  if (account.domain) return null;
  const byDomain = new Map<string, string[]>();
  for (const email of emails) {
    const domain = email.split("@")[1]?.toLowerCase();
    if (!domain || emailType(email) !== "company" || skip.includes(domain))
      continue;
    byDomain.set(domain, [...(byDomain.get(domain) ?? []), email]);
  }
  const [best] = [...byDomain].sort((a, b) => b[1].length - a[1].length);
  if (!best) return null;
  return {
    field: "domain",
    value: best[0],
    strong: false,
    source: "contacts",
    confidence: 0.6,
    evidence: `Contacts on this account write from ${best[1].slice(0, 3).join(", ")}.`,
    at,
  };
}

/** Outbound emails sent since the last reply, newest-first entries in. */
export function unansweredEmails(entries: Entry[]) {
  let count = 0;
  for (const entry of entries) {
    if (entry.kind !== "email" && entry.kind !== "whatsapp") continue;
    if (entry.direction === "inbound") break;
    if (entry.direction === "outbound" && entry.kind === "email") count++;
  }
  return count;
}

export function nextCheck(input: {
  now: number;
  staleDays: number;
  failed: boolean;
  attempts: number;
  unanswered: number;
  jobChange: boolean;
  missing: string[];
}) {
  const { now } = input;
  const stale = input.staleDays * DAY;
  if (input.failed) {
    return input.attempts < MAX_ATTEMPTS
      ? {
          dueAt: now + (HOUR * 4 ** input.attempts) / 4,
          note: "the last check failed",
        }
      : { dueAt: now + stale, note: "checks kept failing" };
  }
  if (input.jobChange) {
    return {
      dueAt: now + 14 * DAY,
      note: "a reply hints they may have moved on",
    };
  }
  if (input.unanswered > 0) {
    const plural = input.unanswered === 1 ? "email" : "emails";
    return {
      dueAt: now + (input.unanswered >= 3 ? 30 : 14) * DAY,
      note: `no reply to ${input.unanswered} ${plural}`,
    };
  }
  if (input.missing.length > 0) {
    return {
      dueAt: now + stale,
      note: `${input.missing.join(" and ")} not found yet`,
    };
  }
  return { dueAt: now + stale, note: "routine refresh" };
}

/** `"<day>:<count>"`, the count of runs started on that India day. */
export function usedToday(raw: string | null, today: string) {
  const [stored, count] = (raw ?? "").split(":");
  return stored === today ? Number(count) || 0 : 0;
}

export function parseLimit(
  raw: string | null,
  key: keyof typeof LIMITS,
): number {
  const value = Number(raw);
  const { min, max } = LIMITS[key];
  return raw !== null && Number.isInteger(value) && value >= min && value <= max
    ? value
    : DEFAULTS[key];
}
