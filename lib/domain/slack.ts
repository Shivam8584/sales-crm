import { HOT_MIN } from "./scoring";

export const SLACK_EVENTS = [
  {
    id: "lead_hot",
    label: "New hot lead",
    hint: `A lead scoring ${HOT_MIN} or more arrives`,
  },
  { id: "deal_won", label: "Deal won", hint: "A deal moves to Won" },
  { id: "deal_lost", label: "Deal lost", hint: "A deal moves to Lost" },
  {
    id: "lead_sla",
    label: "SLA breached",
    hint: "A lead gets no first touch in time",
  },
  {
    id: "weekly_report",
    label: "Weekly report",
    hint: "A short summary when the weekly email goes out",
  },
  {
    id: "agent_output",
    label: "Agent output",
    hint: "Messages your custom agents post",
  },
] as const;

export type SlackEventId = (typeof SLACK_EVENTS)[number]["id"];

export const isSlackEvent = (value: string): value is SlackEventId =>
  SLACK_EVENTS.some((event) => event.id === value);

export type SlackBlock = Record<string, unknown>;

/** Names and record links only; contact details never go to Slack. */
export type SlackEventPayload = {
  name: string;
  detail?: string;
  path?: string;
};

const TITLE: Record<SlackEventId, string> = {
  lead_hot: "New hot lead",
  deal_won: "Deal won",
  deal_lost: "Deal lost",
  lead_sla: "SLA breached",
  weekly_report: "Weekly report",
  agent_output: "Agent",
};

/** Slack treats only these three characters as markup. */
export const escapeSlack = (value: string) =>
  value.replace(/[&<>]/g, (char) =>
    char === "&" ? "&amp;" : char === "<" ? "&lt;" : "&gt;",
  );

export function slackEventMessage(
  event: SlackEventId,
  { name, detail, path }: SlackEventPayload,
  origin: string,
) {
  const label = escapeSlack(name);
  const link = path ? `<${origin}${path}|${label}>` : label;
  const body = detail ? `\n${escapeSlack(detail)}` : "";
  return {
    text: `${TITLE[event]}: ${name}`,
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: `*${TITLE[event]}* ${link}${body}` },
      },
    ] as SlackBlock[],
  };
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?<![\w/])[+(]?\d[\d\s().-]{7,}\d/g;
const MIN_PHONE_DIGITS = 9;

/** Last line of defence for free text (agent output): email addresses and phone numbers are masked. */
export function redactContacts(text: string) {
  return text
    .replace(EMAIL, "[email hidden]")
    .replace(PHONE, (match) =>
      match.replace(/\D/g, "").length >= MIN_PHONE_DIGITS
        ? "[phone hidden]"
        : match,
    );
}

const LITERAL_KEYS = new Set(["type", "url", "action_id", "block_id"]);

export function redactBlocks(value: unknown): unknown {
  if (typeof value === "string") return redactContacts(value);
  if (Array.isArray(value)) return value.map(redactBlocks);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        LITERAL_KEYS.has(key) ? item : redactBlocks(item),
      ]),
    );
  }
  return value;
}

const CHANNEL_ID = /^[CGD][A-Z0-9]{8,}$/;
const CHANNEL_NAME = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const MAX_TEXT = 3000;

/** A channel ID, or a channel name as `#name`. */
export function normalizeChannel(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (CHANNEL_ID.test(value)) return { ok: true, value };
  const name = value.replace(/^#/, "").toLowerCase();
  if (CHANNEL_NAME.test(name)) return { ok: true, value: `#${name}` };
  return { ok: false, error: "Enter a channel like #sales or its ID" };
}

export const clampText = (text: string) =>
  text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
