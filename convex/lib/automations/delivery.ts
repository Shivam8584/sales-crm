import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";

/**
 * Outbound delivery. With no provider configured a message stays in the outbox
 * as "queued" and is never reported as sent.
 *
 * Email: EMAIL_PROVIDER=resend (RESEND_API_KEY, EMAIL_FROM) or
 * EMAIL_PROVIDER=novu (NOVU_API_KEY, NOVU_EMAIL_WORKFLOW, optional NOVU_API_URL) or
 * EMAIL_PROVIDER=smtp (SMTP_HOST, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, optional SMTP_PORT).
 * EMAIL_REPLY_TO, if set, receives replies (resend and smtp); point it at the inbox that feeds the inbound webhook.
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

/**
 * Email providers deduplicate on the step key, so a retry after a timeout can't
 * double-send; Meta has no idempotency key, so WhatsApp only retries on 429,
 * which means the request was refused rather than possibly delivered.
 */
export async function deliver(
  ctx: Pick<ActionCtx, "runAction">,
  message: OutboundMessage,
): Promise<DeliveryResult> {
  if (message.provider === "smtp") {
    return ctx.runAction(internal.smtp.send, {
      to: message.to,
      subject: message.subject ?? "",
      text: message.body ?? "",
      key: message.stepKey,
    });
  }
  if (message.provider === "resend") {
    const result = await post(
      "https://api.resend.com/emails",
      {
        Authorization: `Bearer ${env("RESEND_API_KEY")}`,
        "Idempotency-Key": message.stepKey,
      },
      {
        from: env("EMAIL_FROM"),
        reply_to: env("EMAIL_REPLY_TO"),
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
    const base = env("NOVU_API_URL") ?? "https://api.novu.co";
    const result = await post(
      `${base}/v1/events/trigger`,
      { Authorization: `ApiKey ${env("NOVU_API_KEY")}` },
      {
        name: env("NOVU_EMAIL_WORKFLOW"),
        to: { subscriberId: message.recipientId, email: message.to },
        payload: { subject: message.subject, body: message.body },
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
    retryable: code === "ECONNECTION" || code === "EDNS",
  };
}
