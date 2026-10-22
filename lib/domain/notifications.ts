import { DEAL_STAGE_LABEL } from "./labels";

const MINUTE = 60_000;

/** Follow notifications about one record within this window merge into one. */
export const FOLLOW_BATCH_MS = 10 * MINUTE;

export type FollowBatch = { createdAt: number; archivedAt?: number };

/**
 * Whether a new follow event joins the follower's latest notification about
 * the record: only inside the window, and never one they've archived, which
 * would bring it back unasked.
 */
export function joinsBatch(previous: FollowBatch | null, now: number) {
  if (!previous || previous.archivedAt !== undefined) return false;
  return now - previous.createdAt < FOLLOW_BATCH_MS;
}

export function followTitle(recordName: string, count: number) {
  return count > 1 ? `${recordName} · ${count} updates` : recordName;
}

type FollowEntry = {
  kind: string;
  subject?: string;
  changes?: { field: string; from?: string; to?: string }[];
};

const DEAL_STAGES = Object.values(DEAL_STAGE_LABEL);
const SYSTEM_PREFIXES = [
  "created the deal ",
  "won the deal ",
  "lost the deal ",
  "moved the account to ",
  "set the status to ",
];
const LOGGED: Record<string, string> = {
  note: "added a note",
  call: "logged a call",
  meeting: "logged a meeting",
  email: "logged an email",
  whatsapp: "logged a WhatsApp",
};

/**
 * What a follower hears about a timeline entry, reading after the actor's name,
 * or null when the entry isn't worth a notification (most field edits).
 */
export function followEvent(entry: FollowEntry): string | null {
  if (entry.kind in LOGGED) return LOGGED[entry.kind];
  if (entry.kind === "change") {
    const change = entry.changes?.find(
      (item) => item.field === "Stage" || item.field === "Status",
    );
    if (!change?.to) return null;
    return `changed the ${change.field.toLowerCase()} to ${change.to}`;
  }
  if (entry.kind === "system" && entry.subject) {
    const subject = entry.subject;
    if (SYSTEM_PREFIXES.some((prefix) => subject.startsWith(prefix))) {
      return subject;
    }
    if (
      subject.startsWith("moved the deal ") &&
      DEAL_STAGES.some(
        (stage) =>
          subject.endsWith(` to ${stage}`) || subject.includes(` to ${stage} `),
      )
    ) {
      return subject;
    }
  }
  return null;
}

const URGENT_KINDS = new Set(["lead_sla", "proposal_approval", "mention"]);
const ACTION_KINDS = new Set([
  "lead_assigned",
  "lead_new",
  "lead_repeat",
  "demo_booked",
  "demo_rescheduled",
  "proposal_decision",
  "platform_gst_failed",
  "platform_wallet_negative",
  "platform_campaign_paused",
  "platform_campaign_status_changed",
]);

/** 0 needs a reply now, 1 needs doing, 2 is for information. */
export function kindPriority(kind: string) {
  return URGENT_KINDS.has(kind) ? 0 : ACTION_KINDS.has(kind) ? 1 : 2;
}

export const isActionKind = (kind: string) => kindPriority(kind) < 2;

type Ranked = { kind: string; read: boolean; _creationTime: number };

/** Unread action-needed first, urgent before the rest; everything else newest first. */
export function byPriority(a: Ranked, b: Ranked) {
  const rank = (item: Ranked) => (item.read ? 2 : kindPriority(item.kind));
  return rank(a) - rank(b) || b._creationTime - a._creationTime;
}

export const RECORD_TYPES = ["accounts", "deals", "leads", "people"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

/** `accounts:<id>`: the record a notification is about, for grouping and batching. */
export function recordKey(type: RecordType, id: string) {
  return `${type}:${id}`;
}

export function parseRecordKey(key: string) {
  const [type, id] = key.split(":");
  return (RECORD_TYPES as readonly string[]).includes(type) && id
    ? { type: type as RecordType, id }
    : null;
}

/** The record an in-app link points at, e.g. `/deals/abc?tab=proposal` → `deals:abc`. */
export function recordFromHref(href: string | undefined | null) {
  const match = href?.match(/^\/(accounts|deals|leads|people)\/([a-z0-9]+)/);
  return match ? recordKey(match[1] as RecordType, match[2]) : undefined;
}

export const ENTRY_ANCHOR = "entry-";

export function entryHref(type: RecordType, id: string, entryId: string) {
  return `/${type}/${id}#${ENTRY_ANCHOR}${entryId}`;
}
