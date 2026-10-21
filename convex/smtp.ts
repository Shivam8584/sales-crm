"use node";

import nodemailer from "nodemailer";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { smtpFailure, type DeliveryResult } from "./lib/automations/delivery";

const env = (name: string) => process.env[name]?.trim() || undefined;

/** Sends one plain-text email through EMAIL_PROVIDER=smtp. */
export const send = internalAction({
  args: {
    to: v.string(),
    subject: v.string(),
    text: v.string(),
    key: v.string(),
  },
  handler: async (
    _ctx,
    { to, subject, text, key },
  ): Promise<DeliveryResult> => {
    const port = Number(env("SMTP_PORT") ?? 587);
    const from = env("EMAIL_FROM") ?? "";
    const domain = from.match(/@([^>\s]+)/)?.[1] ?? "localhost";
    const transport = nodemailer.createTransport({
      host: env("SMTP_HOST"),
      port,
      secure: port === 465,
      requireTLS: port !== 465,
      auth: { user: env("SMTP_USER"), pass: env("SMTP_PASSWORD") },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    try {
      const info = await transport.sendMail({
        from,
        to,
        subject,
        text,
        messageId: `<${key.replace(/[^A-Za-z0-9._-]/g, ".")}@${domain}>`,
      });
      return { ok: true, providerMessageId: info.messageId };
    } catch (error) {
      return smtpFailure(error);
    } finally {
      transport.close();
    }
  },
});
