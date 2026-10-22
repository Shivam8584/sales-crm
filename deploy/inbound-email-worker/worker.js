import PostalMime from "postal-mime";
import { isAuthenticated } from "./auth.js";

const MAX_BODY_BYTES = 100 * 1024;
const MAX_RECIPIENTS = 50;

const hex = (buffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

async function sign(secret, text) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

const clip = (value) => {
  if (!value || value.length * 4 <= MAX_BODY_BYTES) return value || undefined;
  const bytes = new TextEncoder().encode(value);
  if (bytes.length <= MAX_BODY_BYTES) return value;
  return new TextDecoder().decode(bytes.slice(0, MAX_BODY_BYTES));
};

const mailboxes = (list) =>
  (list ?? [])
    .flatMap((item) =>
      item.group
        ? mailboxes(item.group)
        : item.address
          ? [{ email: item.address, name: item.name || undefined }]
          : [],
    )
    .slice(0, MAX_RECIPIENTS);

const worker = {
  async email(message, env) {
    const mail = await PostalMime.parse(message.raw);
    const body = JSON.stringify({
      messageId: mail.messageId || `${message.from}-${Date.now()}`,
      from: mail.from?.address
        ? { email: mail.from.address, name: mail.from.name || undefined }
        : message.from,
      rcpt: message.to,
      to: mailboxes(mail.to),
      cc: mailboxes(mail.cc),
      authenticated: isAuthenticated(
        mail.headers,
        mail.from?.address?.split("@").pop(),
      ),
      attachments: mail.attachments?.length ?? 0,
      subject: mail.subject || undefined,
      text: clip(mail.text),
      html: clip(mail.html),
      date: mail.date || undefined,
      receivedAt: Date.now(),
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await sign(env.INBOUND_EMAIL_SECRET, `${timestamp}.${body}`);
    const response = await fetch(env.WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Inbound-Timestamp": String(timestamp),
        "X-Inbound-Signature": `sha256=${signature}`,
      },
      body,
    });
    if (!response.ok) {
      throw new Error(`CRM webhook answered ${response.status}`);
    }
  },
};

export default worker;
