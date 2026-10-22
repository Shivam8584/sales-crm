/** Turning Gmail and Google Calendar items into what the CRM logs: who they were with and in which direction. */
import { customerRecipients, parseMailboxes, type Mailbox } from "./email-log";
import { normalizeEmail } from "./normalize";

export const MAIL_BACKFILL_DAYS = 14;
export const CALENDAR_BACKFILL_DAYS = 30;
/** Re-read this far behind the last run so an event edited after it ended is still caught. */
export const CALENDAR_OVERLAP_MS = 24 * 60 * 60_000;
export const MAX_EXCLUDES = 100;

const MAX_SNIPPET = 280;
const MAX_SUBJECT = 300;
const MAX_ATTENDEES = 20;
const MAX_MEETING_MIN = 24 * 60;
const SKIPPED_LABELS = ["SPAM", "TRASH", "DRAFT"];

export type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  labelIds?: string[];
  payload?: { headers?: { name: string; value: string }[] };
};

export type ParsedMail = {
  messageId: string;
  threadId: string;
  at: number;
  subject: string;
  snippet: string;
  from: Mailbox | null;
  to: Mailbox[];
  cc: Mailbox[];
  sent: boolean;
};

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Gmail returns snippets HTML-escaped. */
export function decodeEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const point =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isInteger(point) && point > 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Splits `A <a@x>, "B, C" <b@x>` on the commas outside quotes and angle brackets. */
export function splitAddressList(header: string) {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < header.length; i++) {
    const char = header[i];
    if (char === '"') quoted = !quoted;
    else if (!quoted && char === "<") depth++;
    else if (!quoted && char === ">") depth = Math.max(0, depth - 1);
    else if (!quoted && depth === 0 && char === ",") {
      parts.push(header.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(header.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

const mailboxesOf = (header: string | undefined) =>
  parseMailboxes(splitAddressList(header ?? ""));

/** A message worth considering, or null for drafts, spam, trash and anything without a Message-ID. */
export function parseGmailMessage(message: GmailMessage): ParsedMail | null {
  if (message.labelIds?.some((label) => SKIPPED_LABELS.includes(label))) {
    return null;
  }
  const headers = new Map<string, string>();
  for (const { name, value } of message.payload?.headers ?? []) {
    const key = name.toLowerCase();
    if (!headers.has(key)) headers.set(key, value);
  }
  const messageId = headers.get("message-id")?.trim();
  const at = Number(message.internalDate);
  if (!messageId || !Number.isFinite(at) || at <= 0) return null;
  return {
    messageId,
    threadId: message.threadId ?? message.id,
    at,
    subject: (headers.get("subject") ?? "").trim().slice(0, MAX_SUBJECT),
    snippet: decodeEntities(message.snippet ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_SNIPPET),
    from: mailboxesOf(headers.get("from"))[0] ?? null,
    to: mailboxesOf(headers.get("to")),
    cc: mailboxesOf(headers.get("cc")),
    sent: message.labelIds?.includes("SENT") ?? false,
  };
}

/** One address or domain per line (or comma); `@kesar.in` and `kesar.in` mean the same. */
export function parseExcludes(input: string) {
  const out = new Set<string>();
  for (const part of input.split(/[\s,;]+/)) {
    const value = part.trim().toLowerCase().replace(/^@/, "");
    if (!value || value.length > 254) continue;
    if (value.includes("@")) {
      const email = normalizeEmail(value);
      if (email) out.add(email);
    } else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value)) {
      out.add(value);
    }
  }
  return [...out].slice(0, MAX_EXCLUDES);
}

export function isExcluded(email: string, excludes: string[]) {
  const at = email.lastIndexOf("@");
  const domain = at > 0 ? email.slice(at + 1) : "";
  return excludes.some(
    (rule) =>
      rule === email ||
      (!rule.includes("@") && (domain === rule || domain.endsWith(`.${rule}`))),
  );
}

export type Skip = {
  memberEmails: Set<string>;
  logAddress: string;
  ownDomains: string[];
  excludes: string[];
};

/**
 * The customers on the other side of a message: for mail you sent, everyone
 * you wrote to; for mail you received, the sender. Teammates, our own domains
 * and excluded addresses never count, so internal threads match nobody.
 */
export function mailCounterparts(
  mail: ParsedMail,
  self: string[],
  skip: Skip,
): { direction: "inbound" | "outbound"; people: Mailbox[] } {
  const outbound =
    mail.sent || (mail.from !== null && self.includes(mail.from.email));
  const candidates = outbound
    ? [...mail.to, ...mail.cc]
    : mail.from
      ? [mail.from]
      : [];
  return {
    direction: outbound ? "outbound" : "inbound",
    people: customerRecipients(candidates, skip).filter(
      (person) => !isExcluded(person.email, skip.excludes),
    ),
  };
}

export const gmailLink = (account: string, threadId: string) =>
  `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${encodeURIComponent(threadId)}`;

export type GoogleEvent = {
  id: string;
  iCalUID?: string;
  status?: string;
  eventType?: string;
  summary?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: {
    email?: string;
    self?: boolean;
    resource?: boolean;
    responseStatus?: string;
  }[];
};

export type ParsedMeeting = {
  key: string;
  at: number;
  durationMin: number;
  subject: string;
  link?: string;
  attendees: Mailbox[];
};

/** A timed meeting with other people that has started and that you haven't declined or cancelled. */
export function parseCalendarEvent(
  event: GoogleEvent,
  now: number,
): ParsedMeeting | null {
  if (event.status === "cancelled") return null;
  if (event.eventType && event.eventType !== "default") return null;
  const startText = event.start?.dateTime;
  const start = startText ? Date.parse(startText) : NaN;
  if (!Number.isFinite(start) || start > now) return null;
  const attendees = event.attendees ?? [];
  if (attendees.some((a) => a.self && a.responseStatus === "declined")) {
    return null;
  }
  const others = parseMailboxes(
    attendees
      .filter((a) => !a.self && !a.resource && a.email)
      .map((a) => ({ email: a.email })),
  );
  if (!others.length || attendees.length > MAX_ATTENDEES) return null;
  const end = event.end?.dateTime ? Date.parse(event.end.dateTime) : NaN;
  const minutes = Number.isFinite(end) ? Math.round((end - start) / 60_000) : 0;
  return {
    key: `${event.iCalUID ?? event.id}@${start}`,
    at: start,
    durationMin: Math.min(Math.max(minutes, 1), MAX_MEETING_MIN),
    subject: (event.summary ?? "").trim().slice(0, MAX_SUBJECT) || "Meeting",
    link: event.htmlLink,
    attendees: others,
  };
}

export function meetingGuests(meeting: ParsedMeeting, skip: Skip): Mailbox[] {
  return customerRecipients(meeting.attendees, skip).filter(
    (guest) => !isExcluded(guest.email, skip.excludes),
  );
}
