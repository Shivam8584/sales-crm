import type { ReplyChannel } from "./automations-model";

// ── Inbound replies ─────────────────────────────────────────────────────────

export type Address = { email: string | null; name: string | null };

/** `Asha Menon <asha@kesar.in>`, a bare address, or `{email, name}`. */
export function parseAddress(input: unknown): Address {
  if (input && typeof input === "object" && !Array.isArray(input)) {
    const value = input as Record<string, unknown>;
    const email = typeof value.email === "string" ? value.email : null;
    const name = typeof value.name === "string" ? value.name : null;
    return {
      email: email?.trim().toLowerCase() || null,
      name: name?.trim() || null,
    };
  }
  if (typeof input !== "string") return { email: null, name: null };
  const angled = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(input);
  if (angled) {
    return {
      email: angled[2].trim().toLowerCase() || null,
      name: angled[1].trim() || null,
    };
  }
  return { email: input.trim().toLowerCase() || null, name: null };
}

const QUOTE_HEADER =
  /^(on\s.+wrote:|-{2,}\s*original message\s*-{2,}|from:\s.+)$/i;

/** The new part of a reply: drops quoted lines and everything after an "On … wrote:" header. */
export function stripQuoted(text: string) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const kept: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (QUOTE_HEADER.test(trimmed)) break;
    if (trimmed.startsWith(">")) continue;
    kept.push(line);
  }
  const out = kept.join("\n").trim();
  return out || text.trim();
}

/** Plain text from simple HTML email bodies. */
export function htmlToText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Epoch ms from an ISO string, epoch seconds or epoch ms; null when unreadable. */
export function parseTimestamp(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    return input < 1e12 ? Math.round(input * 1000) : Math.round(input);
  }
  if (typeof input === "string" && input.trim()) {
    if (/^\d+(\.\d+)?$/.test(input.trim()))
      return parseTimestamp(Number(input));
    const at = Date.parse(input.replace(/ UTC$/, "Z").replace(" ", "T"));
    return Number.isFinite(at) ? at : null;
  }
  return null;
}

export type ChatwootMessage = {
  id: string;
  channel: ReplyChannel;
  content: string;
  at: number | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  conversationId: string | null;
  orgId: string | null;
};

export type ChatwootParse =
  | { ok: true; message: ChatwootMessage }
  | { ok: false; ignored: string };

const CHATWOOT_CHANNEL: Record<string, ReplyChannel> = {
  "Channel::Email": "email",
  "Channel::Whatsapp": "whatsapp",
};

const record = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const str = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim()
    : typeof value === "number"
      ? String(value)
      : null;

/** An incoming customer message from a Chatwoot `message_created` webhook. */
export function parseChatwoot(payload: Record<string, unknown>): ChatwootParse {
  if (payload.event !== "message_created")
    return { ok: false, ignored: `event ${String(payload.event)}` };
  const type = payload.message_type;
  if (type !== "incoming" && type !== 0)
    return { ok: false, ignored: "not an incoming message" };
  if (payload.private === true) return { ok: false, ignored: "private note" };
  const id = str(payload.id);
  if (!id) return { ok: false, ignored: "no message id" };
  const conversation = record(payload.conversation);
  const sender = {
    ...record(record(conversation.meta).sender),
    ...record(payload.sender),
  };
  const channelName =
    str(conversation.channel) ?? str(record(payload.inbox).channel_type);
  let channel = channelName ? CHATWOOT_CHANNEL[channelName] : undefined;
  const rawPhone = str(sender.phone_number);
  if (!channel && channelName === "Channel::TwilioSms" && rawPhone) {
    const source = str(record(conversation.contact_inbox).source_id) ?? "";
    if (source.startsWith("whatsapp:")) channel = "whatsapp";
  }
  if (!channel)
    return { ok: false, ignored: `channel ${channelName ?? "unknown"}` };
  const attributes = {
    ...record(conversation.additional_attributes),
    ...record(conversation.custom_attributes),
  };
  return {
    ok: true,
    message: {
      id,
      channel,
      content: str(payload.content) ?? "",
      at: parseTimestamp(payload.created_at),
      email: str(sender.email)?.toLowerCase() ?? null,
      phone: rawPhone?.replace(/^whatsapp:/, "") ?? null,
      name: str(sender.name),
      conversationId: str(conversation.display_id) ?? str(conversation.id),
      orgId: str(attributes.hd_org_id),
    },
  };
}
