# Hypedrive CRM

The sales CRM for the Hypedrive team, built for selling to D2C brands and marketplace sellers in India. Everything is live: every screen updates in real time across the team.

- **Pipeline:** inbound leads with a speed-to-lead SLA, scoring and routing rules; accounts and people with GSTIN/DIN verification and an enrichment waterfall; deals with a board, a deal desk and one proposal per deal; tasks and a Today cockpit; a per-record timeline; custom fields and file attachments.
- **Selling:** Sequences (template-first multi-step email and task follow-ups, with consent checks and one-reply unsubscribe), a Playbook of objection answers and battlecards, click-to-call and a call log, optional AI briefs, next-action hints, quick capture, drafts and call summaries.
- **Platform:** sync and activation tracking against the Hypedrive platform, stuck-brand alerts, prospecting from marketplace listings, reports.
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

Convex deployment variables are set with `npx convex env set NAME value`. All are optional unless marked.

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
| `VAPID_PUBLIC_KEY`                   | Convex | Browser push only. Public key; generate a pair with `npx web-push generate-vapid-keys`                     |
| `VAPID_PRIVATE_KEY`                  | Convex | Browser push only. Private key of the same pair; keep it secret                                            |
| `VAPID_SUBJECT`                      | Convex | Browser push only. Contact for push services, e.g. `mailto:you@hypedrive.in`                               |
| `WHATSAPP_PHONE_NUMBER_ID`           | Convex | Meta WhatsApp Cloud API number; with `WHATSAPP_ACCESS_TOKEN` automations send for real                     |
| `OPENAI_API_KEY`                     | Convex | Turns on AI briefs, drafts, call summaries and quick capture; unset = AI is hidden                         |
| `EXOTEL_SID`, `EXOTEL_API_KEY`       | Convex | Exotel account SID and API key for click-to-call; needs every Exotel variable here, else it is hidden      |
| `EXOTEL_API_TOKEN`                   | Convex | Exotel API token                                                                                           |
| `EXOTEL_SUBDOMAIN`                   | Convex | Exotel API host for your region: `api.exotel.com` (Singapore) or `api.in.exotel.com` (Mumbai)              |
| `EXOTEL_CALLER_ID`                   | Convex | Your ExoPhone number, shown to the customer                                                                |
| `EXOTEL_WEBHOOK_SECRET`              | Convex | Secret in the status callback `/webhooks/exotel?secret=…` that logs each call; unset rejects it            |
| `AI_MODEL`                           | Convex | Model for briefs, drafts and call summaries; default `gpt-6.1-sol`                                         |
| `AI_MODEL_FAST`                      | Convex | Model for quick capture and next actions; default `gpt-6-luna`                                             |
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

`GET https://sales.hypedrive.app/api/health` returns 200 `{"ok":true,"convex":true}` when the app is up and Convex answers a query, else 503; point UptimeRobot at it. The web container's own Docker healthcheck stays on `/demo` so a Convex outage doesn't make Traefik drop the app. With `SENTRY_DSN` in `.env` (a GlitchTip project on errors.hypedrive.app), Next server errors and screens that crash in the browser are reported; rebuild the web image after setting it. For Convex function errors, add the same DSN as a log stream:

```bash
curl -X POST "$CONVEX_SELF_HOSTED_URL/api/v1/create_log_stream" -H "Authorization: Convex $CONVEX_SELF_HOSTED_ADMIN_KEY" \
  -H "Content-Type: application/json" -d '{"logStreamType":"sentry","dsn":"<dsn>"}'
```

Convex stores its data in a dedicated `postgres:17` container (database `hypedrive_crm`, volume `hypedrive-crm_pgdata`) that is only on the project's private network.

### Deploying a new version

Merging to `main` deploys: GitHub Actions (`.github/workflows/ci.yml`) runs the checks and a production build, then `npx convex deploy`, then `deploy/deploy.sh`, which syncs the source to the server, builds the image there, restarts `web` and polls `/api/health`. If the new container isn't healthy within two minutes it re-tags the previous image and restarts it, and the job fails. The workflow reads these repository secrets: `DEPLOY_SSH_KEY` (a key authorised for `ubuntu@ampere2`), `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`, `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY`.

By hand, with the two Convex variables from `.env.production.local` exported:

```bash
set -a; . ./.env.production.local; set +a
npx convex deploy      # functions, schema, crons
deploy/deploy.sh       # web
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

Point `EMAIL_REPLY_TO` at the inbox that feeds `/webhooks/email-inbound`, so a reply of "unsubscribe" withdraws consent and stops the person's sequences.

### One-off steps after a release

Run against production with the admin key exported (see Deploying a new version). Each is idempotent:

```bash
npx convex run counts:rebuild '{"table":"accounts"}'   # also people, leads, platformEvents: repairs list counts and report facts
npx convex run migrations:run '{"fn":"migrations:scoreLeads"}'   # backfills lead scores
npx convex run playbook:seedStarter                    # starter Playbook entries, only when the table is empty
```

The admin System page (Settings → System) shows service health, the last week's failures and whether the list counts match, with a Rebuild button per table.

### AI, push and calls

- **AI:** set `OPENAI_API_KEY` (and optionally `AI_MODEL`, `AI_MODEL_FAST`) on the Convex deployment. Unset, every AI surface stays hidden.
- **Web push:** generate a VAPID pair with `node -e "console.log(require('web-push').generateVAPIDKeys())"` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.
- **Click-to-call from the CRM:** set the `EXOTEL_*` variables; without them the Call button opens the phone dialer or a timed call log.

### Checks

`npm run check` runs the type check, lint and the pure-logic tests; GitHub Actions runs it plus a production build on every push.
