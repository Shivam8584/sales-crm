#!/usr/bin/env node
/**
 * Signs and sends one Hypedrive platform event to the CRM webhook.
 *
 *   node scripts/send-platform-event.mjs <event> '<data json>' [--id <event_id>] [--at <iso time>]
 *   node scripts/send-platform-event.mjs --file envelope.json
 *
 * Add `--env-file=.env.local` after `node` to pick up the local Convex site URL.
 * Env: PLATFORM_WEBHOOK_SECRET (required), PLATFORM_WEBHOOK_URL (defaults to
 * $NEXT_PUBLIC_CONVEX_SITE_URL/webhooks/platform, then the local Convex site).
 */
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    file: { type: "string" },
    id: { type: "string" },
    at: { type: "string" },
  },
});

function exit(message) {
  console.error(message);
  process.exit(1);
}

const secret = process.env.PLATFORM_WEBHOOK_SECRET;
if (!secret) exit("Set PLATFORM_WEBHOOK_SECRET to the secret the CRM uses.");

const site = (
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL ?? "http://127.0.0.1:3211"
).replace(/\/$/, "");
const url = process.env.PLATFORM_WEBHOOK_URL ?? `${site}/webhooks/platform`;

let body;
if (values.file) {
  body = readFileSync(values.file, "utf8");
} else {
  const [event, data = "{}"] = positionals;
  if (!event) {
    exit(
      "Usage: send-platform-event.mjs <event> '<data json>' [--id <event_id>] [--at <iso>]",
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(data);
  } catch {
    exit("The data argument must be JSON.");
  }
  body = JSON.stringify({
    event_id: values.id ?? `evt_${randomUUID()}`,
    event,
    occurred_at: values.at ?? new Date().toISOString(),
    data: parsed,
  });
}

const signature = createHmac("sha256", secret).update(body).digest("hex");
const response = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Hypedrive-Signature": `sha256=${signature}`,
  },
  body,
});
console.log(response.status, await response.text());
process.exitCode = response.ok ? 0 : 1;
