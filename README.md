# Hypedrive CRM

The sales CRM for the Hypedrive team, built for selling to D2C brands and marketplace sellers in India. Everything is live: every screen updates in real time across the team.

- **Pipeline:** inbound leads with a speed-to-lead SLA, scoring and routing rules; accounts and people with GSTIN/DIN verification and an enrichment waterfall; deals with a board, a deal desk and one proposal per deal; tasks and a Today cockpit; a per-record timeline; custom fields and file attachments.
- **Selling:** Sequences (template-first multi-step email and task follow-ups, with consent checks and one-reply unsubscribe), a Playbook of objection answers and battlecards, click-to-call and a call log, optional AI briefs, next-action hints, quick capture, drafts and call summaries.
- **Platform:** sync and activation tracking against the Hypedrive platform, stuck-brand alerts, prospecting from marketplace listings, reports.
- **Data quality and access:** duplicate finder and merge (Settings → Duplicates), an audit log of field changes with restore for archived and deleted records (Settings → Audit log, managers and admins), a team Activity feed, a weekly manager report email, rep emails logged to timelines by BCC (`log@replies.hypedrive.app`), and an MCP server with personal API tokens so Claude or Cursor can read the CRM and, with a read and write token, make a small set of safe changes as you.
- **Working in it:** saved views, pins, inline and bulk edits with Undo (Ctrl/Cmd+Z), a command palette, smart notifications with a daily digest and web push, a first-run tour, an installable PWA with an offline page, and an admin System page.

Only `/demo` (the embeddable demo-request form) and `/api/health` are public. Everything else is behind sign-in.

## Stack

- Next.js 16 App Router (Turbopack), React 19, Tailwind CSS 4
- Self-hosted [Convex](https://github.com/get-convex/convex-backend/tree/main/self-hosted) for data, live queries, HTTP webhooks and scheduled jobs, with Convex Auth: Hypedrive SSO (Logto, OIDC) for staff, email and password as a fallback.
- Convex components: `@convex-dev/rate-limiter` (demo form, lookups, product checks, automation send caps, inbound dedupe) and `@convex-dev/migrations` (data migrations)
- Radix primitives, cmdk, dnd-kit, motion; zustand for UI state only

## Architecture

```
app/                   thin route files; each imports a feature page
convex/schema.ts       data model
convex/<module>.ts     one file per domain: accounts, people, deals, leads, tasks,
                       timeline, notifications, members, invites, enrichment,
                       platform, activation, reports, alerts, automations (Sequences),
                       ai, playbook, customFields, files, calls, views, pins, push,
                       digest, system, seed
convex/lib/            functions.ts (memberQuery/memberMutation/managerMutation/admin*),
                       errors.ts, validators.ts, records.ts, timeline.ts, money.ts,
                       crypto.ts, http.ts, plus helpers per module
convex/http.ts         public endpoints: POST /leads, /webhooks/{calcom,platform,email-inbound,chatwoot,exotel}
lib/domain/            pure shared domain: enums, labels, money (integer minor units),
                       normalize, gstin, leads
lib/                   client utilities: errors, keyboard, time, utils, seo
components/_ui/        primitives (Button, Input, Dialog, Sheet, Tag, Avatar, …)
components/_common/    FilterMenu, toaster, providers
components/shell/      AppShell, Page/PageHeader/PageToolbar, sidebar, command menu
components/data-table/ generic list with URL sort, selection, keyboard and mobile cards
components/record/     record page layout and properties
components/fields/     OptionPicker, InlineText, TagsField
components/board/      generic Kanban engine
features/<module>/     all module UI: pages, dialogs, sections, hooks
hooks/                 use-viewer, use-url-state, use-record-update, use-mobile-breakpoints
stores/                ui-store (dialogs, sidebar, command menu), toast-store
```

## Routes

`lib/routes.ts` is the only place that spells an in-app path; pages, emails, push and notifications build links from it, and `lib/routes-usage.test.mjs` fails on a raw path literal anywhere else.

| Area       | Paths                                                                    |
| ---------- | ------------------------------------------------------------------------ |
| Work       | `/today`, `/inbox`, `/tasks`                                             |
| Pipeline   | `/pipeline/{prospecting,leads,deals,activation}`, detail at `…/<id>`     |
| Automation | `/automation/{sequences,agents}`, detail at `…/<id>`                      |
| Records    | `/records/{accounts,people}`, detail at `…/<id>`, `…/accounts/<id>/report` |
| Insights   | `/insights/{reports,activity,playbook}`                                  |
| Settings   | `/settings/{profile,team,workspace,fields,targets,duplicates,audit,integrations,system}` |

There are no redirects from the old paths. `npx convex run migrations:runAll` rewrites stored notification links and saved-view paths to the new ones (run it once per deployment). The lead-capture webhook stays `POST /leads` on the Convex site URL; it is not a page.

## Local setup

```bash
npm install
npm run convex:up                      # backend on :3210/:3211, dashboard on :6791
docker compose -f docker-compose.convex.yml exec backend ./generate_admin_key.sh
cp .env.example .env.local             # paste the admin key
```

Generate the auth signing keys once per deployment (script from the [Convex Auth manual setup](https://labs.convex.dev/auth/setup/manual)) and set them:

```bash
npx convex env set SITE_URL http://localhost:3000
npx convex env set -- JWT_PRIVATE_KEY "<private key, newlines replaced by spaces>"
npx convex env set JWKS '<jwks json>'
```

Run `npm run convex:dev` (pushes functions and watches) next to `npm run dev`, then open [http://localhost:3000](http://localhost:3000). The first person to sign up becomes the admin; everyone after needs an invite or an email on `ALLOWED_EMAIL_DOMAINS`.

To fill an empty workspace with demo data (accounts at every stage, brands on the platform, deals with a proposal, tasks, leads and notifications), sign in once and run:

```bash
npm run seed:demo
```

`npm run seed:reset` wipes the app data (not members, invites or settings) and seeds again; it refuses unless `SITE_URL` is localhost. Demo contacts use reserved addresses (`name@brand.example`) and unallocated `+91 00000…` numbers, so automations never reach a real person; account domains stay real for logos.

Data migrations live in `convex/migrations.ts` (`migrations.define`). Deploy, then run one with `npx convex run migrations:run '{"fn": "migrations:<name>"}'` (add `"dryRun": true` to preview); it runs in batches and resumes where it stopped. `npx convex run --component migrations lib:getStatus --watch` shows progress.

| Script                  | What it does                            |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Next.js dev server                      |
| `npm run build`         | Production build                        |
| `npm run lint`          | ESLint                                  |
| `npm run test`          | Unit tests for the pure domain logic    |
| `npm run check`         | Type-check, lint and test               |
| `npm run convex:up`     | Start the self-hosted Convex containers |
| `npm run convex:down`   | Stop them                               |
| `npm run convex:dev`    | Push Convex functions and watch         |
| `npm run convex:deploy` | Deploy Convex functions to production   |

## Environment

Convex deployment variables are set with `npx convex env set NAME value`. All are optional unless marked. Integration keys (OpenAI, the KYC service, Exotel) can instead be saved by an admin in Settings → Integrations → Keys once `KEYS_ENCRYPTION_KEY` is set; they are stored AES-256-GCM encrypted, shown only as their last 4 characters, and an environment variable of the same name always wins. Changing `KEYS_ENCRYPTION_KEY` makes stored keys unreadable, so re-enter them afterwards.

| Variable                             | Where  | What it does                                                                                               |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------- |
| `SITE_URL`                           | Convex | Required. The CRM's public URL; used by auth, CORS and links in alerts                                     |
| `AUTH_LOGTO_ID`, `AUTH_LOGTO_SECRET` | Convex | Logto (Hypedrive SSO) app for staff sign-in; unset hides the SSO button                                    |
| `AUTH_LOGTO_ISSUER`                  | Convex | Logto OIDC issuer, `https://auth.hypedrive.app/oidc`                                                       |
| `AUTH_PASSWORD_ENABLED`              | Convex | `0` turns off email and password sign-in and sign-up (on by default)                                       |
| `DEMO_DEPLOYMENT`                    | Convex | `1` lets `seed:reset` run on this non-local deployment when `confirmSiteUrl` matches                       |
| `JWT_PRIVATE_KEY`, `JWKS`            | Convex | Required. Convex Auth signing keys                                                                         |
| `ALLOWED_EMAIL_DOMAINS`              | Convex | Comma-separated domains (e.g. `hypedrive.in`) that can join without an invite                              |
| `LEAD_FORM_ORIGINS`                  | Convex | Comma-separated origins allowed to post the demo form; defaults to `SITE_URL` and localhost                |
| `LEAD_SLA_SECONDS`                   | Convex | Speed-to-lead target before a lead is flagged as breached; default 300                                     |
| `CALCOM_WEBHOOK_SECRET`              | Convex | Secret for the Cal.com booking webhook at `/webhooks/calcom` (`X-Cal-Signature-256`)                       |
| `ALERT_SLACK_WEBHOOK_URL`            | Convex | Slack incoming webhook for new leads, demo bookings and SLA breaches                                       |
| `ALERT_WEBHOOK_URL`                  | Convex | Generic JSON webhook for the same events                                                                   |
| `SLACK_BOT_TOKEN`, `SLACK_WEBHOOK_URL`, `SLACK_SIGNING_SECRET` | Convex | Slack integration (Settings → Integrations → Slack): a bot token with `chat:write`, or an incoming webhook URL as the fallback. Can be saved under Keys instead; the section stays "Not configured" without one |
| `KYC_BASE_URL`                       | Convex | KYC provider base URL for GSTIN and DIN lookups                                                            |
| `KYC_API_TOKEN`                      | Convex | KYC provider API token                                                                                     |
| `KYC_HMAC_SECRET`                    | Convex | Verifies signed KYC responses                                                                              |
| `ENRICHMENT_SANDBOX`                 | Convex | Set to `1` to return test data instead of calling the KYC provider (local only)                            |
| `ENRICHMENT_ORDER`                   | Convex | Order of the account lookup chain, e.g. `gst,platform,website`; leave out a source to turn it off          |
| `PLATFORM_WEBHOOK_SECRET`            | Convex | Secret for platform events at `/webhooks/platform` (`X-Hypedrive-Signature`)                               |
| `EMAIL_PROVIDER`                     | Convex | `smtp`, `resend` or `novu` for the notification digest and automation emails; unset = outbox               |
| `SMTP_HOST`, `SMTP_PORT`             | Convex | SMTP server for `EMAIL_PROVIDER=smtp`; port 587 (STARTTLS) by default, 465 for TLS                         |
| `SMTP_USER`, `SMTP_PASSWORD`         | Convex | SMTP credentials                                                                                           |
| `EMAIL_FROM`                         | Convex | Sender, e.g. `Hypedrive <no-reply@hypedrive.app>`                                                          |
| `EMAIL_REPLY_TO`                     | Convex | Reply-To of sequence emails; the inbox that feeds the inbound webhook                                      |
| `INBOUND_LOG_ADDRESS`                | Convex | Address reps BCC to log customer emails; default `log@replies.hypedrive.app`                               |
| `VAPID_PUBLIC_KEY`                   | Convex | Browser push only. Public key; generate a pair with `npx web-push generate-vapid-keys`                     |
| `VAPID_PRIVATE_KEY`                  | Convex | Browser push only. Private key of the same pair; keep it secret                                            |
| `VAPID_SUBJECT`                      | Convex | Browser push only. Contact for push services, e.g. `mailto:you@hypedrive.in`                               |
| `WHATSAPP_PHONE_NUMBER_ID`           | Convex | Meta WhatsApp Cloud API number; with `WHATSAPP_ACCESS_TOKEN` automations send for real                     |
| `OPENAI_API_KEY`                     | Convex | Turns on AI briefs, drafts, call summaries and quick capture; unset = AI is hidden. Can also be saved in Settings → Integrations → Keys |
| `KEYS_ENCRYPTION_KEY`                | Convex | 32+ random characters (`openssl rand -base64 32`). Encrypts keys saved in Settings → Integrations → Keys; unset = env only |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Convex | Google OAuth client for Profile → Connections (Gmail and Calendar sync); needs `KEYS_ENCRYPTION_KEY` too, else the section is hidden |
| `EXOTEL_SID`, `EXOTEL_API_KEY`       | Convex | Exotel account SID and API key for click-to-call; needs every Exotel variable here, else it is hidden      |
| `EXOTEL_API_TOKEN`                   | Convex | Exotel API token                                                                                           |
| `EXOTEL_SUBDOMAIN`                   | Convex | Exotel API host for your region: `api.exotel.com` (Singapore) or `api.in.exotel.com` (Mumbai)              |
| `EXOTEL_CALLER_ID`                   | Convex | Your ExoPhone number, shown to the customer                                                                |
| `EXOTEL_WEBHOOK_SECRET`              | Convex | Secret in the status callback `/webhooks/exotel?secret=…` that logs each call; unset rejects it            |
| `AI_MODEL`                           | Convex | Model for briefs, drafts and call summaries; default `gpt-6.1-sol`                                         |
| `AI_MODEL_FAST`                      | Convex | Model for quick capture, next actions and record questions; default `gpt-6-luna`                           |
| `AI_EMBED_MODEL`                     | Convex | Embedding model for similar accounts; default `text-embedding-3-small` (1536 dimensions)                   |
| `OPENAI_BASE_URL`                    | Convex | Optional proxy or compatible endpoint, e.g. `https://proxy.example/v1`                                     |
| `NEXT_PUBLIC_CONVEX_URL`             | Next   | Required. Convex API URL (`CONVEX_CLOUD_ORIGIN`)                                                           |
| `NEXT_PUBLIC_CONVEX_SITE_URL`        | Next   | Convex HTTP-actions URL (`CONVEX_SITE_ORIGIN`); the demo form posts leads here                             |
| `NEXT_PUBLIC_CALCOM_LINK`            | Next   | Cal.com booking link shown after the demo form                                                             |
| `NEXT_PUBLIC_SITE_URL`               | Next   | Canonical URL for robots and the sitemap                                                                   |
| `SENTRY_DSN`                         | Next   | GlitchTip/Sentry DSN for server errors; `NEXT_PUBLIC_SENTRY_DSN` (build time) for the browser. Unset = off |

## Production

Production runs on `ampere2` next to other Dokploy projects, as a plain Compose project in `/opt/hypedrive-crm` (root-only). Dokploy's Traefik routes it through labels on `dokploy-network` and issues Let's Encrypt certificates.

| Host                              | Service                                          |
| --------------------------------- | ------------------------------------------------ |
| `sales.hypedrive.app`             | Next.js app (`Dockerfile`, standalone output)    |
| `convex-sales.hypedrive.app`      | Convex API and websocket (`CONVEX_CLOUD_ORIGIN`) |
| `convex-sales-site.hypedrive.app` | Convex HTTP actions: `/leads`, webhooks          |
| `convex-sales-dash.hypedrive.app` | Convex dashboard, behind basic auth              |

The DNS records are DNS-only (not proxied by Cloudflare): Traefik then sees the visitor's IP and overwrites `X-Forwarded-For`, which the demo form's per-IP rate limit relies on. Proxying them through Cloudflare would rate-limit by Cloudflare edge IP instead.

On the server:

```
/opt/hypedrive-crm/
  compose.yml        # copy of deploy/compose.prod.yml
  .env               # INSTANCE_SECRET, POSTGRES_PASSWORD, CONVEX_ADMIN_KEY, dashboard login, hostnames,
                     # R2_* (off-server backups), optional SENTRY_DSN
  whatsapp.env       # Meta WhatsApp Cloud API credentials, not yet set on Convex
  src/               # the app source the web image is built from
  backup.sh          # copy of deploy/backup.sh
  backups/           # nightly dumps, 14 days
```

### Sign-in

Staff sign in with Hypedrive SSO: the Logto app "Hypedrive Sales CRM" (Traditional web, redirect URIs `https://convex-sales-site.hypedrive.app/api/auth/callback/logto` and `http://127.0.0.1:3211/api/auth/callback/logto`, scopes `openid profile email`). Like the other internal tools it only admits users with a platform staff role (Logto app-level access control). Workspace membership is unchanged: the first member is admin, then invites or `ALLOWED_EMAIL_DOMAINS`. An SSO sign-in with a verified email joins the existing account with that email, so someone who started on a password keeps their membership. Set `AUTH_PASSWORD_ENABLED=0` once everyone signs in with SSO.

### Monitoring

`GET https://sales.hypedrive.app/api/health` returns 200 `{"ok":true,"convex":true}` when the app is up and Convex answers a query, else 503; point UptimeRobot at it. The web container's own Docker healthcheck stays on `/demo` so a Convex outage doesn't make Traefik drop the app. With `SENTRY_DSN` in `.env` (a project on the team GlitchTip at errors.hypedrive.app), Next server errors and screens that crash in the browser are reported; rebuild the web image after setting it. For Convex function errors, add the same DSN as a log stream:

```bash
curl -X POST "$CONVEX_SELF_HOSTED_URL/api/v1/create_log_stream" -H "Authorization: Convex $CONVEX_SELF_HOSTED_ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"logStreamType":"sentry","dsn":"<dsn>"}'
```

Convex stores its data in a dedicated `postgres:17` container (database `hypedrive_crm`, volume `hypedrive-crm_pgdata`) that is only on the project's private network.

### Deploying a new version

Pushing to `main` deploys. A systemd timer on the server (`hypedrive-crm-autodeploy.timer`, every minute) runs `deploy/autodeploy.sh`, which fetches `origin/main` and, when there is a new commit:

1. runs `npm ci`, `npm run check` and `npx convex deploy` in a Node container on the Convex network, as the Convex docs describe for a Git-integrated host (the admin key is generated on the spot and never stored);
2. builds the `web` image and restarts it;
3. polls `/api/health`; if the new container isn't healthy within two minutes it re-tags the previous image, restarts it and records the commit as failed so it isn't retried.

A failing check or Convex deploy stops before anything changes. Progress and failures are in `/var/log/hypedrive-crm-deploy.log`; run it now with `ssh ampere2 sudo systemctl start hypedrive-crm-autodeploy.service`. `deploy/compose.prod.yml` is copied over `/opt/hypedrive-crm/compose.yml` on every deploy.

Anyone who can push to `main` can deploy, so protect that branch. One-time setup (clones the repo into `/opt/hypedrive-crm/src` and enables the timer):

```bash
ssh ampere2 'sudo bash -s' < deploy/install-autodeploy.sh
```

The production workspace is a demo for now (`DEMO_DEPLOYMENT=1`), so it can be reset to fresh demo data:

```bash
npx convex run seed:reset '{"confirmSiteUrl": "https://sales.hypedrive.app"}'
```

The web image bakes in `NEXT_PUBLIC_*` at build time from the hostnames in `.env`. To set Convex variables, use `npx convex env set` with the same two variables exported.

### Backups

`/etc/cron.d/hypedrive-crm-backup` runs `backup.sh` every night at 21:00 UTC (02:30 IST). It writes `backups/hypedrive_crm-YYYY-MM-DD.dump` (`pg_dump -Fc`) and `backups/convex-data-YYYY-MM-DD.tgz` (the backend's local storage), deletes local files older than 14 days, then copies the day's files with `rclone` to the Cloudflare R2 bucket `hypedrive-crm-backups` under `YYYY-MM-DD/` and deletes objects older than 30 days there. The R2 credentials are `R2_ENDPOINT`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` in `.env`; without `R2_BUCKET` the upload is skipped. Output goes to `/var/log/hypedrive-crm-backup.log`.

To fetch a dump from R2 (on any machine with rclone):

```bash
export RCLONE_CONFIG_R2_TYPE=s3 RCLONE_CONFIG_R2_PROVIDER=Cloudflare RCLONE_CONFIG_R2_ENDPOINT=… \
  RCLONE_CONFIG_R2_ACCESS_KEY_ID=… RCLONE_CONFIG_R2_SECRET_ACCESS_KEY=…
rclone lsf r2:hypedrive-crm-backups
rclone copy r2:hypedrive-crm-backups/YYYY-MM-DD ./backups
```

To restore, stop the backend so nothing writes, replace the database and start again:

```bash
cd /opt/hypedrive-crm
sudo docker compose stop web dashboard backend
sudo docker compose exec -T postgres dropdb -U convex hypedrive_crm
sudo docker compose exec -T postgres createdb -U convex hypedrive_crm
sudo docker compose exec -T postgres pg_restore -U convex -d hypedrive_crm --no-owner < backups/hypedrive_crm-YYYY-MM-DD.dump
sudo docker compose up -d
```

To check a dump without touching production, restore it into a scratch database and boot a throwaway backend against it. Convex picks the database from `INSTANCE_NAME`, with dashes turned into underscores:

```bash
cd /opt/hypedrive-crm && set -a && . ./.env && set +a
sudo docker compose exec -T postgres createdb -U convex hypedrive_crm_restore_test
sudo docker compose exec -T postgres pg_restore -U convex -d hypedrive_crm_restore_test --no-owner < backups/hypedrive_crm-YYYY-MM-DD.dump
sudo docker run -d --rm --name hdcrm-restore-test --network hypedrive-crm_internal -p 127.0.0.1:13210:3210 \
  -e INSTANCE_NAME=hypedrive-crm-restore-test -e INSTANCE_SECRET="$INSTANCE_SECRET" -e DO_NOT_REQUIRE_SSL=1 \
  -e POSTGRES_URL="postgresql://convex:$POSTGRES_PASSWORD@postgres:5432" ghcr.io/convex/convex-backend:$CONVEX_REV
sudo docker exec hdcrm-restore-test ./generate_admin_key.sh   # then `npx convex data` against 127.0.0.1:13210 over an SSH tunnel
sudo docker stop hdcrm-restore-test
sudo docker compose exec -T postgres dropdb -U convex hypedrive_crm_restore_test
```

### Webhooks

Set each secret first; an endpoint with no secret answers 503. All are on `https://convex-sales-site.hypedrive.app`:

| Path                      | From                                         | Secret                                                |
| ------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `/webhooks/calcom`        | Cal.com bookings                             | `CALCOM_WEBHOOK_SECRET`                               |
| `/webhooks/platform`      | Hypedrive platform events                    | `PLATFORM_WEBHOOK_SECRET`                             |
| `/webhooks/email-inbound` | Inbound email relay (replies, "unsubscribe") | `INBOUND_EMAIL_SECRET` (HMAC)                         |
| `/webhooks/chatwoot`      | Chatwoot messages                            | `INBOUND_CHATWOOT_SECRET` or `INBOUND_CHATWOOT_TOKEN` |
| `/webhooks/exotel`        | Exotel call status                           | `EXOTEL_WEBHOOK_SECRET` (`?secret=`)                  |

The inbound email relay (a Cloudflare Email Worker on `replies.hypedrive.app`) is in `deploy/inbound-email-worker/`. Point `EMAIL_REPLY_TO` at the inbox that feeds `/webhooks/email-inbound`, so a reply of "unsubscribe" withdraws consent and stops the person's sequences.

### One-off steps after a release

Run against production with the admin key exported (see Deploying a new version). Each is idempotent:

```bash
npx convex run counts:rebuild '{"table":"accounts"}'   # also people, leads, platformEvents: repairs list counts and report facts
npx convex run migrations:run '{"fn":"migrations:scoreLeads"}'   # backfills lead scores
npx convex run playbook:seedStarter                    # starter Playbook entries, only when the table is empty
```

The admin System page (Settings → System) shows service health, the last week's failures and whether the list counts match, with a Rebuild button per table.

### MCP (AI assistants)

`POST https://convex-sales-site.hypedrive.app/mcp` is a stateless MCP server (Streamable HTTP, JSON-RPC). Each member creates a token under Settings → Profile → AI assistants; a token acts as that member, read-only or read and write, never with more permission than the member has. Tools: `search_records`, `get_account`, `get_person`, `get_lead`, `get_deal`, `list_my_tasks`, `todays_summary`, `list_sequences`, `get_sequence`, `read_sequence_log`, and, for read and write tokens only, `create_note`, `create_task`, `complete_task`, `create_lead` (refused when an open lead or person with that email or phone exists), `update_deal_stage`, `log_call` and `add_tag`. Nothing destructive is exposed: no delete, erase, merge or send. Tokens are read only unless you pick Read & write when creating one. Writes run through the same mutations as the app with the owner's role, so permission and erasure rules apply; each is limited to 20 a minute per token, accepts an optional `idempotencyKey` (repeating it returns the first result), and shows on the record's timeline and the Activity feed as "via MCP (token name)". Settings → Profile → AI assistants lists recent changes with Undo (kept 30 days; refused if the record has changed since). Tokens are stored hashed, limited to 60 calls a minute, and browser origins are refused. The failed-auth limiter keys on `X-Forwarded-For`, so the proxy must set it.

### Logging customer emails

BCC `log@replies.hypedrive.app` (or forward the mail to it) from your own CRM email address and it appears on the matching person's or lead's timeline. It is accepted only when the sender is an active member and the mail passed SPF or DKIM; otherwise it is ignored silently. The Cloudflare rule and Worker are described in `deploy/inbound-email-worker/README.md`.

### Gmail and Calendar sync

Each member can connect their own Google account under Settings → Profile → Connections. Mail and meetings with people already in the CRM are added to their timeline (subject, a short snippet and a link, never the body); nothing is sent or changed in Google. The section is hidden until `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `KEYS_ENCRYPTION_KEY` are set on the Convex deployment (refresh tokens are stored AES-256-GCM encrypted).

In Google Cloud, create an OAuth client of type Web application, enable the Gmail API and Google Calendar API, add the scopes `gmail.readonly` and `calendar.readonly`, and register the redirect URI `<CONVEX_SITE_URL>/google/callback` (the HTTP actions domain, the same host as `NEXT_PUBLIC_CONVEX_SITE_URL`). While the consent screen is in Testing, only listed test users can connect; publishing needs Google's verification for these sensitive and restricted scopes.

A cron runs every 15 minutes. The first run reads 14 days of mail and 30 days of meetings; after that it follows Gmail history, at most 300 messages per member per run. A message is logged once even if the rep also BCCs it (matched by Message-ID), and a meeting once even if several teammates attended. Teammates, our own domains, each member's "Never log" list, erased people and anyone who withdrew consent or asked for erasure are skipped. Disconnecting deletes the stored token, revokes it at Google and, if asked, removes the entries it added. If Google revokes access the member gets a notification to reconnect.

### Slack

Settings → Integrations → Slack posts to a channel when something happens. Add a bot token (`SLACK_BOT_TOKEN`, scope `chat:write`, and invite the bot to the channel) or, if you can't install an app, an incoming webhook URL (`SLACK_WEBHOOK_URL`, which fixes the channel) under Keys or as environment variables. Then pick a default channel and switch on the events you want: new hot lead (score 70+), deal won, deal lost, SLA breached, weekly report and agent output; each can post to its own channel. Every event is off until switched on. "Send test message" checks the setup, and the last result is shown on the card.

Messages carry names and links to the record only. As a safeguard, any email address or phone number in outgoing text is masked, and erased leads are never posted. Posts are limited to 30 a minute workspace-wide, retried with backoff on Slack rate limits and server errors, and failures never block the action that caused them. Tokens and webhook URLs are never logged. `ALERT_SLACK_WEBHOOK_URL` (lead alerts) keeps working separately; leave one of the two off to avoid double posts. Slash commands and interactivity are not supported.

### Research agent

A background worker that keeps accounts and people fresh without anyone clicking. It is off until an admin turns it on under Settings → System → Research agent, which also sets the daily limit (default 50 checks) and how long a record may sit before its routine refresh (default 30 days). Turning the switch off stops it at once; a manual "Research now" is refused while it is off. It needs no env var: the queue and the CRM-history checks work without an AI key, and with a key (Settings → Integrations → Keys) each record also gets a short written summary.

- **What it reads:** only what this install already has: inbound email signatures and replies on the person's timeline, teammates' notes and calls, the contacts' company email domain, and the enrichment waterfall (GST registry, platform, company website) for accounts that have a GSTIN, website or platform link. There is no web search.
- **Nothing is guessed.** Findings are stored as facts with their evidence in the same model as enrichment suggestions. Only a person's own signature that names them may fill a field (phone, title, LinkedIn), and only while it is empty and nobody cleared or rejected that value; "Undo" on the record clears it and it never returns. Everything else, including a possible job change, is a suggestion to accept or reject. Human-entered values are never overwritten. Erased people are skipped and their queue entry and findings are deleted.
- **When it looks:** new accounts and people, existing records (a few per run, urgent ones first), a reply that hints the sender moved on, a record not checked for the refresh interval, and "Research now". After each check it schedules the next with a visible reason on the record, for example "Checking again in 2 weeks: no reply to 2 emails".
- **Agent tab:** account and person pages get an Agent tab while the agent is on (nothing shows when it is off). It lists what the agent did, newest first (history checked, providers run, what it filled or suggested, when it will look again and why), kept for 60 days. When it cannot decide, it files a question with up to three options and waits: which website, when contacts tie between two company domains; whose details, when a signature names another person on the same account. The answer is applied (a website is set on the account), feeds the next check, and is remembered so the same question is never asked twice; "Not sure" is remembered too. The tab also has Research now and, with an AI key, an Ask box answered from the record. Erasing a person deletes their log and questions.
- **Cost bounds:** a cron runs every 10 minutes and leases at most 5 records, within the daily limit; a lease expires after 10 minutes and a record that keeps failing waits for its routine refresh. An AI summary is one call per changed history, at most 6,000 characters in and 300 tokens out, and is skipped when the history has not changed.

### Custom agents

Automation → Agents turns a sentence into a standing job: "every Monday list my deals with no activity for 10 days and make a task for each", "when a lead is created, post it to #sales". Anyone can make one (up to 10 each); it needs an AI key (Settings → Integrations → Keys) and is hidden behind a "needs an AI key" note without one. No other env var or migration is needed.

- **When:** every day, every weekday or every week at an hour (India time), when a lead is created, a deal changes stage or a reply is logged, or only when run by hand. A cron checks schedules every 5 minutes. Event runs are queued from the same places that fire sequence triggers (replies from the inbound email logger); for an own-scope agent only records its owner owns count.
- **What it can do:** only the MCP tool set (the read tools plus `create_note`, `create_task`, `complete_task`, `create_lead`, `update_deal_stage`, `log_call`, `add_tag`) and, while Slack is connected, `post_slack_message`. Each run acts as its owner with the owner's role, through the same mutations as the app, and shows on timelines as done via MCP (agent name). The model only proposes calls as JSON; the server checks every call against the MCP tool schemas before running it and never evaluates anything or writes to tables directly. "My records" agents are refused any record their owner does not own or is assigned; "The whole team" is for admins.
- **Changes are off by default.** Until the owner switches on Allow changes, every write is only listed as planned. Preview always plans without writing, even with changes on. A run's changes appear under it with Undo (the same undo as Settings → Profile → AI assistants).
- **Hard caps:** 8 model turns, 20 tool calls (6 per turn) and about 60,000 estimated tokens per run; an identical call is not repeated in a run; 10 runs a day per agent (adjustable) and 200 a day workspace-wide, both counting previews. At most one run per agent at a time (three for event agents). Hitting a cap ends the run as "Hit a limit" with the reason. A failed run notifies its owner. Run logs (every step, tool call, result and error) are kept 30 days.
- **Kill switch:** Settings → System → Custom agents stops every agent at once, including queued runs and manual ones, and sets the workspace daily limit.
- **Untrusted data:** record text can contain instructions, so the prompt tells the model to treat tool results as data. The caps, the schema checks, the scope rule and the lack of destructive tools are the real limits; keep Allow changes off for agents that read broad data you do not trust.

### Results reports and split tests

- **Results report:** a linked account's page has Results report in its menu: `/records/accounts/<id>/report` shows a month or a quarter from the platform data the CRM already holds (wallet top-ups, approved results, campaigns, wallet balance, reviews waiting, activation milestones), compared with the period before, and prints to A4 or PDF. The quarter view adds editable talking points, drafted from the numbers (and by AI when a key is set). Spend per campaign is not in the platform feed, so the report shows top-ups and approvals, not spend.
- **Email it:** Email on that page previews the plain-text version, sends it to the account's main contact now, and can switch on a monthly send per account. Both need the contact's consent to product updates, an email provider, and the account's owner or a manager; the workspace stop-all switch holds them. The monthly send runs daily from the 2nd (India time), once per month, and skips a month where nothing happened. It starts with the month after you switch it on.
- **Split tests:** an email step can show a second subject and/or message (Test a second version in the step panel) to a share of the audience. Each enrolment gets one version for good, and Analytics lists sent and replied per version with a "too early to call" note until both have 30 sends; opens are not tracked. Send A or Send B to everyone sets the share to 0 or 100% on the live version without a new version.

### AI, push and calls

- **AI:** add the OpenAI key (and optionally the models and base URL) in Settings → Integrations → Keys, or set `OPENAI_API_KEY`, `AI_MODEL`, `AI_MODEL_FAST` on the Convex deployment. Unset, every AI surface stays hidden.
- **Web push:** generate a VAPID pair with `node -e "console.log(require('web-push').generateVAPIDKeys())"` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.
- **Click-to-call from the CRM:** set the `EXOTEL_*` variables; without them the Call button opens the phone dialer or a timed call log.

### Checks

`npm run check` is the production gate: `next typegen`, the type check, lint, the pure-logic tests (`npm test`) and the Convex function tests (`npm run test:convex`). It needs no browser, server or network. `scripts/check.mjs` runs ESLint beside the type check and tests, and ESLint caches in `.eslintcache`, so a re-run only lints files that changed. Node 22 is the target (`.nvmrc`, `engines`); Dependabot opens weekly grouped PRs for npm, the Dockerfile and `deploy/compose.prod.yml`, and skips major bumps of Next, React and Convex. The Dockerfile pins `node:22-alpine` by digest: bump it from the Dependabot PR.

- **Convex function tests** (`tests/convex`, Vitest + `convex-test`) run the real functions against an in-memory Convex with the rate-limiter, aggregate and migrations components registered (`tests/convex/setup.ts`). They cover permissions by role, consent and erasure, lead scoring and routing, sequences, merge, MCP tokens, custom fields and attachments. Seed members with `seedMember`/`seedTeam`; sign in as one with its `as` client.
- **End-to-end smoke tests** (`tests/e2e`, Playwright, `npm run e2e`) are not part of `check`. They drive a real browser against the local stack, so start it first (`npm run convex:up`, `npx convex dev`, `npm run dev`) and load the demo data once with `npx convex run seed:reset`. They sign in with the seeded logins, undo or delete what they change, and refuse to run against a non-local `E2E_BASE_URL`.

| Variable | Default |
| --- | --- |
| `E2E_BASE_URL` | `http://localhost:3000` |
| `E2E_CONVEX_URL` | `http://127.0.0.1:3210` |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | `shivam@hypedrive.in` / `crm-ccb55666` |
| `E2E_REP_EMAIL` / `E2E_REP_PASSWORD` | `rep1@example.com` / `crm-ccb55666` |
| `E2E_CHROMIUM` | path to a Chromium binary; unset uses Playwright's own (`npx playwright install chromium`) |
