/** Logging customer emails by BCC or forward: who the customers are and what was forwarded. */
import { parseAddress, stripQuoted } from "./automations";
import { normalizeEmail } from "./normalize";

export const DEFAULT_LOG_ADDRESS = "log@replies.hypedrive.app";
export const OWN_DOMAIN = "hypedrive.app";

export type Mailbox = { email: string; name?: string };

const MAX_MAILBOXES = 50;

export function parseMailboxes(input: unknown): Mailbox[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Mailbox[] = [];
  for (const item of input.slice(0, MAX_MAILBOXES)) {
    const parsed = parseAddress(item);
    const email = parsed.email ? normalizeEmail(parsed.email) : null;
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, ...(parsed.name ? { name: parsed.name } : {}) });
  }
  return out;
}

export function domainOf(address: string | null | undefined) {
  const email = address ? parseAddress(address).email : null;
  const at = email?.lastIndexOf("@") ?? -1;
  return email && at > 0 ? email.slice(at + 1) : null;
}

const inDomain = (domain: string, own: string) =>
  domain === own || domain.endsWith(`.${own}`);

/** Recipients who aren't teammates, the log address or one of our own mailboxes. */
export function customerRecipients(
  recipients: Mailbox[],
  skip: { memberEmails: Set<string>; logAddress: string; ownDomains: string[] },
) {
  return recipients.filter((recipient) => {
    if (recipient.email === skip.logAddress) return false;
    if (skip.memberEmails.has(recipient.email)) return false;
    const domain = domainOf(recipient.email);
    return !domain || !skip.ownDomains.some((own) => inDomain(domain, own));
  });
}

export type Forwarded = {
  from: Mailbox;
  date: number | null;
  subject: string | null;
  body: string;
};

const MARKER =
  /^[\s>*_=-]*(?:begin forwarded message|-{2,}\s*(?:forwarded|original) message\s*-{2,})[\s>*_=:-]*$/i;
const FWD_SUBJECT = /^\s*(?:fwd?|fw)\s*:/i;
const HEADER_LINES = 14;
const SCAN_LINES = 50;

/** Epoch ms from the Date: / Sent: line of a forwarded header block, read as India time when it names no zone; null when unreadable. */
export function parseForwardedDate(raw: string, now = Date.now()) {
  if (!/\d{4}/.test(raw)) return null;
  let cleaned = raw
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+at\s+/i, " ")
    .replace(/\bIST\b/, "+0530")
    .trim();
  if (!/(?:[+-]\d{4}|\b(?:GMT|UTC|Z))\s*$/i.test(cleaned)) cleaned += " +0530";
  const at = Date.parse(cleaned);
  return Number.isFinite(at) && at <= now + 24 * 60 * 60_000 ? at : null;
}

function senderOf(value: string): Mailbox | null {
  const cleaned = value.replace(/mailto:/gi, "").replace(/\*/g, "");
  const parsed = parseAddress(cleaned);
  const email =
    (parsed.email ? normalizeEmail(parsed.email) : null) ??
    normalizeEmail(/[^\s<>"'()]+@[^\s<>"'()]+/.exec(cleaned)?.[0] ?? "");
  if (!email) return null;
  const name = parsed.name?.replace(/^["']|["']$/g, "").trim();
  return { email, ...(name && !name.includes("@") ? { name } : {}) };
}

/**
 * The original sender, date, subject and body of a forwarded message: the
 * header block that follows a "Forwarded message" marker, or, when the
 * subject starts with Fwd:, the first From: block in the body.
 */
export function parseForwarded(
  text: string,
  subject?: string,
): Forwarded | null {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^[\s>]+/, ""));
  const marker = lines.findIndex((line) => MARKER.test(line));
  if (marker < 0 && !FWD_SUBJECT.test(subject ?? "")) return null;

  const end = Math.min(lines.length, marker + 1 + SCAN_LINES);
  for (let i = marker + 1; i < end; i++) {
    const match = /^\*?from\*?:\s*(.+)$/i.exec(lines[i].replace(/\*/g, ""));
    if (!match) continue;
    const from = senderOf(match[1]);
    if (!from) continue;
    let date: number | null = null;
    let original: string | null = null;
    let j = i + 1;
    for (; j < lines.length && j <= i + HEADER_LINES; j++) {
      const line = lines[j].replace(/\*/g, "").trim();
      if (!line) break;
      const header = /^(date|sent|subject):\s*(.*)$/i.exec(line);
      if (!header) continue;
      if (header[1].toLowerCase() === "subject") original = header[2].trim();
      else date = parseForwardedDate(header[2]);
    }
    return {
      from,
      date,
      subject: original || null,
      body: stripQuoted(lines.slice(j + 1).join("\n")),
    };
  }
  return null;
}
