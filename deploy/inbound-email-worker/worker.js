import PostalMime from "postal-mime";

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

const worker = {
  async email(message, env) {
    const mail = await PostalMime.parse(message.raw);
    const body = JSON.stringify({
      messageId: mail.messageId || `${message.from}-${Date.now()}`,
      from: mail.from?.address
        ? { email: mail.from.address, name: mail.from.name || undefined }
        : message.from,
      subject: mail.subject || undefined,
      text: mail.text || undefined,
      html: mail.html || undefined,
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
