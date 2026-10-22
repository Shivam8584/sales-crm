import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  checkSender,
  renderTemplate,
  type Language,
} from "../../../lib/domain/automations";
import { normalizeEmail } from "../../../lib/domain/normalize";

const UNSUBSCRIBE_LINES: Record<Language, string> = {
  en: "Don't want these emails? Reply \"unsubscribe\" and I'll stop.",
  hinglish:
    'Ye emails nahi chahiye? "unsubscribe" likh kar reply kar dijiye, hum band kar denge.',
  hi: 'ये ईमेल नहीं चाहिए? "unsubscribe" लिखकर जवाब दें, हम बंद कर देंगे।',
};

/** Always contains the word "unsubscribe", which is what replies are matched on. */
export function unsubscribeLine(language: Language = "en") {
  return `--\n${UNSUBSCRIBE_LINES[language] ?? UNSUBSCRIBE_LINES.en}`;
}

/** The subject and body exactly as sent, footer included. */
export function renderEmail(
  email: { subject: string; body: string },
  vars: Partial<Record<string, string>>,
  language?: Language,
) {
  return {
    subject: renderTemplate(email.subject, vars).text.trim(),
    body: `${renderTemplate(email.body, vars).text.trim()}\n\n${unsubscribeLine(language)}`,
  };
}

/**
 * Outbound delivery. With no provider configured a message stays in the outbox
 * as "queued" and is never reported as sent.
 *
 * Email: EMAIL_PROVIDER=resend (RESEND_API_KEY, EMAIL_FROM) or
 * EMAIL_PROVIDER=novu (NOVU_API_KEY, NOVU_EMAIL_WORKFLOW, optional NOVU_API_URL) or
 * EMAIL_PROVIDER=smtp (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, optional SMTP_PORT).
 * EMAIL_REPLY_TO, if set, receives replies; point it at the inbox that feeds the inbound webhook.
 * WhatsApp (Meta Cloud API, approved templates only): WHATSAPP_PHONE_NUMBER_ID and
 * WHATSAPP_ACCESS_TOKEN, optional WHATSAPP_API_VERSION.
 */
export type Provider = "outbox" | "resend" | "novu" | "smtp" | "meta";

export type ProviderStatus = {
  provider: Provider;
  /** Why the outbox is used even though a provider was asked for. */
  problem?: string;
};

const env = (name: string) => process.env[name]?.trim() || undefined;

export function emailProvider(): ProviderStatus {
  const choice = env("EMAIL_PROVIDER")?.toLowerCase();
  if (!choice) return { provider: "outbox" };
  if (choice === "resend") {
    const missing = ["RESEND_API_KEY", "EMAIL_FROM"].filter((key) => !env(key));
    return missing.length
      ? {
          provider: "outbox",
          problem: `EMAIL_PROVIDER is resend but ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing`,
        }
      : { provider: "resend" };
  }
  if (choice === "novu") {
    const missing = ["NOVU_API_KEY", "NOVU_EMAIL_WORKFLOW"].filter(
      (key) => !env(key),
    );
    return missing.length
      ? {
          provider: "outbox",
          problem: `EMAIL_PROVIDER is novu but ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing`,
        }
      : { provider: "novu" };
  }
  if (choice === "smtp") {
    const missing = [
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASSWORD",
      "EMAIL_FROM",
    ].filter((key) => !env(key));
    return missing.length
      ? {
          provider: "outbox",
          problem: `EMAIL_PROVIDER is smtp but ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing`,
        }
      : { provider: "smtp" };
  }
  return { provider: "outbox", problem: `Unknown EMAIL_PROVIDER “${choice}”` };
}

export function whatsappProvider(): ProviderStatus {
  const id = env("WHATSAPP_PHONE_NUMBER_ID");
  const token = env("WHATSAPP_ACCESS_TOKEN");
  if (!id && !token) return { provider: "outbox" };
  if (!id || !token) {
    return {
      provider: "outbox",
      problem: `WHATSAPP_${id ? "ACCESS_TOKEN" : "PHONE_NUMBER_ID"} is missing`,
    };
  }
  return { provider: "meta" };
}

export type OutboundMessage = {
  channel: "email" | "whatsapp";
  provider: Provider;
  stepKey: string;
  recipientId: string;
  to: string;
  subject?: string;
  body?: string;
  /** Per-sequence display name and reply address for email; see `emailHeaders`. */
  senderName?: string;
  replyTo?: string;
  template?: string;
  language?: string;
  params?: string[];
};

export type DeliveryResult =
  | { ok: true; providerMessageId?: string }
  | { ok: false; error: string; retryable: boolean };

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<
  { status: number; json: Record<string, unknown> | null } | { error: string }
> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    return { status: response.status, json };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function describe(json: Record<string, unknown> | null, status: number) {
  const nested = json?.error as Record<string, unknown> | string | undefined;
  const message =
    (typeof nested === "object" ? nested?.message : nested) ?? json?.message;
  return typeof message === "string"
    ? `${status}: ${message}`
    : `HTTP ${status}`;
}

const HEADER_BREAKS = /[\u0000-\u001f\u007f\u2028\u2029]+/g;

const addressOf = (value: string) =>
  value.match(/<([^<>]+)>/)?.[1].trim() ?? value.trim();

/**
 * The address in From is always EMAIL_FROM's; a sequence may only change the
 * display name. Values are re-checked here because they come from stored data.
 */
export function emailHeaders(sender: {
  senderName?: string;
  replyTo?: string;
}) {
  const base = env("EMAIL_FROM");
  const name = checkSender({ senderName: sender.senderName });
  const senderName = name.ok ? name.senderName : undefined;
  const reply = checkSender({ replyTo: sender.replyTo });
  const from =
    base && senderName ? `"${senderName}" <${addressOf(base)}>` : base;
  const replyTo = (reply.ok && reply.replyTo) || env("EMAIL_REPLY_TO");
  return {
    from: from?.replace(HEADER_BREAKS, " ").trim(),
    replyTo: replyTo?.replace(HEADER_BREAKS, " ").trim(),
  };
}

/** Whether replies to this sequence land in the inbox the CRM reads. */
export function repliesTracked(replyTo: string | undefined) {
  if (!replyTo) return true;
  const workspace = env("EMAIL_REPLY_TO");
  return (
    Boolean(workspace) &&
    normalizeEmail(addressOf(workspace!)) === normalizeEmail(replyTo)
  );
}

/** Rejects what SMTP would read as several recipients, since stored emails only check for one `@`. */
const SAFE_ADDRESS = /^[^\s@,;<>"()[\]\\:]+@[^\s@,;<>"()[\]\\:]+$/;

/**
 * Email providers deduplicate on the step key, so a retry after a timeout can't
 * double-send; Meta has no idempotency key, so WhatsApp only retries on 429,
 * which means the request was refused rather than possibly delivered.
 */
export async function deliver(
  ctx: Pick<ActionCtx, "runAction">,
  message: OutboundMessage,
): Promise<DeliveryResult> {
  if (message.channel === "email") {
    if (!SAFE_ADDRESS.test(message.to)) {
      return {
        ok: false,
        error: "The recipient address isn't valid",
        retryable: false,
      };
    }
    message = {
      ...message,
      subject: message.subject?.replace(/[\r\n]+/g, " "),
    };
  }
  if (message.provider === "smtp") {
    return ctx.runAction(internal.smtp.send, {
      to: message.to,
      subject: message.subject ?? "",
      text: message.body ?? "",
      key: message.stepKey,
      senderName: message.senderName,
      replyTo: message.replyTo,
    });
  }
  if (message.provider === "resend") {
    const headers = emailHeaders(message);
    const result = await post(
      "https://api.resend.com/emails",
      {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Idempotency-Key": message.stepKey,
      },
      {
        from: headers.from,
        reply_to: headers.replyTo,
        to: [message.to],
        subject: message.subject,
        text: message.body,
      },
    );
    if ("error" in result)
      return { ok: false, error: result.error, retryable: true };
    if (result.status < 300) {
      return {
        ok: true,
        providerMessageId: String(result.json?.id ?? "") || undefined,
      };
    }
    return {
      ok: false,
      error: describe(result.json, result.status),
      retryable: result.status === 429 || result.status >= 500,
    };
  }
  if (message.provider === "novu") {
    const headers = emailHeaders(message);
    const overrides = {
      ...(message.senderName && headers.from && { from: headers.from }),
      ...(message.replyTo && headers.replyTo && { replyTo: headers.replyTo }),
    };
    const base = env("NOVU_API_URL") ?? "https://api.novu.co";
    const result = await post(
      `${base}/v1/events/trigger`,
      { Authorization: `ApiKey ${env("NOVU_API_KEY")}` },
      {
        name: env("NOVU_EMAIL_WORKFLOW"),
        to: { subscriberId: message.recipientId, email: message.to },
        payload: { subject: message.subject, body: message.body },
        ...(Object.keys(overrides).length && {
          overrides: { email: overrides },
        }),
        transactionId: message.stepKey,
      },
    );
    if ("error" in result)
      return { ok: false, error: result.error, retryable: true };
    if (result.status < 300) {
      const data = result.json?.data as Record<string, unknown> | undefined;
      return {
        ok: true,
        providerMessageId: String(data?.transactionId ?? "") || undefined,
      };
    }
    return {
      ok: false,
      error: describe(result.json, result.status),
      retryable: result.status === 429 || result.status >= 500,
    };
  }
  if (message.provider === "meta") {
    const version = env("WHATSAPP_API_VERSION") ?? "v21.0";
    const result = await post(
      `https://graph.facebook.com/${version}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`,
      { Authorization: `Bearer ${env("WHATSAPP_ACCESS_TOKEN")}` },
      {
        messaging_product: "whatsapp",
        to: message.to.replace(/\D/g, ""),
        type: "template",
        template: {
          name: message.template,
          language: { code: message.language },
          components: message.params?.length
            ? [
                {
                  type: "body",
                  parameters: message.params.map((text) => ({
                    type: "text",
                    text,
                  })),
                },
              ]
            : [],
        },
      },
    );
    if ("error" in result)
      return { ok: false, error: result.error, retryable: false };
    if (result.status < 300) {
      const messages = result.json?.messages as { id?: string }[] | undefined;
      return { ok: true, providerMessageId: messages?.[0]?.id };
    }
    return {
      ok: false,
      error: describe(result.json, result.status),
      retryable: result.status === 429,
    };
  }
  return { ok: false, error: "No provider is configured", retryable: false };
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  outbox: "Outbox only",
  resend: "Resend",
  novu: "Novu",
  smtp: "SMTP",
  meta: "WhatsApp Cloud API",
};

/**
 * SMTP has no idempotency key, so only failures where the server certainly
 * didn't accept the message are retried: 4xx replies and failed connections.
 */
/** Errors raised before any mail was handed to the server, so a retry cannot duplicate it. */
const NOT_SENT = /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH/;

export function smtpFailure(error: unknown): DeliveryResult {
  const { code, responseCode, message } = (error ?? {}) as {
    code?: string;
    responseCode?: number;
    message?: string;
  };
  const text = message || String(error);
  if (typeof responseCode === "number") {
    return {
      ok: false,
      error: `${responseCode}: ${text}`,
      retryable: responseCode >= 400 && responseCode < 500,
    };
  }
  return {
    ok: false,
    error: text,
    retryable: code === "ECONNECTION" || code === "EDNS" || NOT_SENT.test(text),
  };
}
