import { DEAL_STAGE_LABEL } from "./labels";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// The team works in India time; snoozes and the digest land at 9:00 there.
const IST_OFFSET = 330 * MINUTE;
const WAKE_HOUR = 9;

/** Follow notifications about one record within this window merge into one. */
export const FOLLOW_BATCH_MS = 10 * MINUTE;

/** Preference groups: each covers notification kinds and can be turned off in-app. */
export const NOTIFICATION_GROUPS = [
  {
    value: "mentions",
    label: "Mentions",
    description: "Someone @mentions you in a note or call.",
    kinds: ["mention"],
  },
  {
    value: "following",
    label: "Records you follow",
    description:
      "Stage changes, new deals, wins, losses and notes on records you follow.",
    kinds: ["follow"],
  },
  {
    value: "leads",
    label: "Leads",
    description: "New, assigned and returning leads, and platform sign-ups.",
    kinds: ["lead_new", "lead_assigned", "lead_repeat", "lead_signup"],
  },
  {
    value: "sla",
    label: "SLA alerts",
    description: "A lead you own is about to miss its first-response time.",
    kinds: ["lead_sla"],
    required: true,
  },
  {
    value: "demos",
    label: "Demos",
    description: "Demos booked, moved or cancelled through Cal.com.",
    kinds: ["demo_booked", "demo_rescheduled", "demo_cancelled"],
  },
  {
    value: "approvals",
    label: "Approvals",
    description: "Proposals waiting for, or decided by, a manager.",
    kinds: ["proposal_approval"],
  },
  {
    value: "platform",
    label: "Platform",
    description: "Organisations created and GST checks on the platform.",
    kinds: ["platform_org", "platform_gst_failed"],
  },
  {
    value: "automations",
    label: "Automations",
    description: "Notify steps in automations you're the recipient of.",
    kinds: ["automation"],
  },
] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number]["value"];

export function groupOfKind(kind: string) {
  return NOTIFICATION_GROUPS.find((group) =>
    (group.kinds as readonly string[]).includes(kind),
  );
}

/** Whether a member's muted groups let this kind through in-app. */
export function deliversInApp(kind: string, muted: readonly string[]) {
  const group = groupOfKind(kind);
  if (!group || ("required" in group && group.required)) return true;
  return !muted.includes(group.value);
}

export type SnoozePreset = "tomorrow" | "next_week";

/** Tomorrow at 9:00, or next Monday at 9:00, India time. */
export function snoozeUntil(preset: SnoozePreset, now: number) {
  const today = Math.floor((now + IST_OFFSET) / DAY);
  let days = 1;
  if (preset === "next_week") {
    const weekday = (today + 4) % 7;
    days = (8 - weekday) % 7 || 7;
  }
  return (today + days) * DAY + WAKE_HOUR * HOUR - IST_OFFSET;
}

/** The next 9:00 India time after `now`, when the daily digest goes out. */
export function nextDigestAt(now: number) {
  const today = Math.floor((now + IST_OFFSET) / DAY);
  const todayAt = today * DAY + WAKE_HOUR * HOUR - IST_OFFSET;
  return todayAt > now ? todayAt : todayAt + DAY;
}

export type FollowBatch = {
  createdAt: number;
  count: number;
  doneAt?: number;
  snoozedUntil?: number;
};

/**
 * Whether a new follow event joins the follower's latest notification about
 * the record: only inside the window, and never one they've already cleared
 * or snoozed, which would bring it back unasked.
 */
export function joinsBatch(previous: FollowBatch | null, now: number) {
  if (!previous) return false;
  if (previous.doneAt !== undefined || previous.snoozedUntil !== undefined) {
    return false;
  }
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

/** Plain-text digest of unread notifications, newest first. */
export function digestText(
  name: string,
  items: { title: string; body?: string; href?: string }[],
  siteUrl: string,
) {
  const first = name.split(/\s+/)[0] || name;
  const count = `${items.length} unread ${items.length === 1 ? "notification" : "notifications"}`;
  const lines = items.map((item) => {
    const link = item.href ? `\n  ${siteUrl}${item.href}` : "";
    return `• ${item.title}${item.body ? ` — ${item.body}` : ""}${link}`;
  });
  return {
    subject: `Hypedrive CRM: ${count}`,
    body: `Good morning ${first},\n\nYou have ${count}.\n\n${lines.join("\n")}\n\nOpen your inbox: ${siteUrl}/inbox\nTurn this email off in Settings → Profile.`,
  };
}
