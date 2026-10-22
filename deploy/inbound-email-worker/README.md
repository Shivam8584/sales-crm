# Inbound email relay

Replies to sequence emails (including "unsubscribe") reach the CRM through a
Cloudflare Email Worker that parses the message and posts it, HMAC-signed, to
`/webhooks/email-inbound`.

Use a subdomain, not the root domain: `hypedrive.app` already has its own MX
(`mail.hypedrive.app`), and Email Routing replaces a domain's MX records.

1. Cloudflare dashboard, `hypedrive.app` → Email → Email Routing → Settings →
   add the subdomain `replies.hypedrive.app` (Cloudflare adds its MX and SPF
   records for that subdomain only).
2. Deploy the Worker from this folder:
   ```bash
   npm install
   npx wrangler login
   npx wrangler secret put INBOUND_EMAIL_SECRET   # paste the value from .env.production.local
   npx wrangler deploy
   ```
3. Email Routing → Routing rules → add `reply@replies.hypedrive.app` →
   action "Send to a Worker" → `hypedrive-crm-inbound-email`.
4. Send a test mail to `reply@replies.hypedrive.app`; an unknown sender shows
   up in the Convex logs as an ignored message.
5. Only then point sequence emails at it:
   ```bash
   npx convex env set EMAIL_REPLY_TO "Hypedrive <reply@replies.hypedrive.app>"
   ```
   (Setting it earlier would send replies to an address that bounces.)
