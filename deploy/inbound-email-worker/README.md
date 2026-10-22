# Inbound email relay

Replies to sequence emails (including "unsubscribe") reach the CRM through a
Cloudflare Email Worker that parses the message and posts it, HMAC-signed, to
`/webhooks/email-inbound`.

Use a subdomain, not the root domain: `hypedrive.app` already has its own MX
(`mail.hypedrive.app`), and Email Routing replaces a domain's MX records.

The Worker `hypedrive-crm-inbound-email` is already deployed (no public URL) with
`INBOUND_EMAIL_SECRET` set. To redeploy after editing it:
`npm install && npx wrangler deploy` here (`npx wrangler login` first if needed).
What is left is Cloudflare dashboard work:

1. `hypedrive.app` → Email → Email Routing → Settings → add the subdomain
   `replies.hypedrive.app` (Cloudflare adds its MX and SPF records for that
   subdomain only).
2. Email Routing → Routing rules → add `reply@replies.hypedrive.app` → action
   "Send to a Worker" → `hypedrive-crm-inbound-email`.
3. Send a test mail to `reply@replies.hypedrive.app`; an unknown sender is
   answered with `unmatched` by the webhook (check `npx convex logs`).
4. Only then point sequence emails at it:
   ```bash
   npx convex env set EMAIL_REPLY_TO "Hypedrive <reply@replies.hypedrive.app>"
   ```
   (Setting it earlier would send replies to an address that bounces.)
