# Inbound email relay

Replies to sequence emails (including "unsubscribe") reach the CRM through a
Cloudflare Email Worker that parses the message and posts it, HMAC-signed, to
`/webhooks/email-inbound`.

Use a subdomain, not the root domain: `hypedrive.app` already has its own MX
(`mail.hypedrive.app`), and Email Routing replaces a domain's MX records.

The Worker `hypedrive-crm-inbound-email` is deployed (no public URL) with
`INBOUND_EMAIL_SECRET` set. `replies.hypedrive.app` has Cloudflare Email Routing
and a rule sends `reply@replies.hypedrive.app` to the Worker; production sets
`EMAIL_REPLY_TO` to that address. The root domain's own mail (`mail.hypedrive.app`)
is untouched.

A second rule sends `log@replies.hypedrive.app` to the same Worker: a member who BCCs it
(or forwards a customer email to it) from their own CRM address gets that email on the matching
person's or lead's timeline. The Worker adds `authenticated` (SPF/DKIM passed at Cloudflare) to the
payload and the CRM ignores log mail that isn't authenticated or isn't from an active member.

To redeploy after editing the Worker: `npm install && npx wrangler deploy` here.
To rebuild the routing from scratch (token needs `zone:read` and `email_routing:write`):

```bash
# enable the subdomain, then route one address to the Worker
curl -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  https://api.cloudflare.com/client/v4/zones/$ZONE/email/routing/dns -d '{"name":"replies.hypedrive.app"}'
curl -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  https://api.cloudflare.com/client/v4/zones/$ZONE/email/routing/rules -d '{"name":"CRM replies","enabled":true,"matchers":[{"type":"literal","field":"to","value":"reply@replies.hypedrive.app"}],"actions":[{"type":"worker","value":["hypedrive-crm-inbound-email"]}]}'
```
