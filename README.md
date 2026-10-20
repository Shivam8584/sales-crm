# Hypedrive CRM

The sales CRM for the Hypedrive team, built for selling to D2C brands and marketplace sellers in India. It covers inbound leads with a speed-to-lead SLA, accounts and people with GSTIN verification, deals, tasks, a per-record timeline, platform sync and activation, reports and team management. Everything is live: every screen updates in real time across the team.

Only `/demo` (the embeddable demo-request form) is public. Everything else is behind sign-in.

## Stack

- Next.js 16 App Router (Turbopack), React 19, Tailwind CSS 4
- Self-hosted [Convex](https://github.com/get-convex/convex-backend/tree/main/self-hosted) for data, live queries, HTTP webhooks and scheduled jobs, with Convex Auth (email and password)
- Radix primitives, cmdk, dnd-kit, motion; zustand for UI state only

## Architecture

```
app/                   thin route files; each imports a feature page
convex/schema.ts       data model
convex/<module>.ts     one file per domain: accounts, people, deals, leads, tasks,
                       timeline, notifications, members, invites, enrichment,
                       platform, activation, reports, alerts, seed
convex/lib/            functions.ts (memberQuery/memberMutation/managerMutation/admin*),
                       errors.ts, validators.ts, records.ts, timeline.ts, money.ts,
                       crypto.ts, http.ts, plus helpers per module
convex/http.ts         public endpoints: POST /leads, /webhooks/calcom, /webhooks/platform
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

To fill an empty workspace with demo accounts and people, sign in once and run:

```bash
npx convex run seed:demo
```

| Script                  | What it does                            |
| ----------------------- | --------------------------------------- |
| `npm run dev`           | Next.js dev server                      |
| `npm run build`         | Production build                        |
| `npm run lint`          | ESLint                                  |
| `npm run convex:up`     | Start the self-hosted Convex containers |
| `npm run convex:down`   | Stop them                               |
| `npm run convex:dev`    | Push Convex functions and watch         |
| `npm run convex:deploy` | Deploy Convex functions to production   |

## Environment

Convex deployment variables are set with `npx convex env set NAME value`. All are optional unless marked.

| Variable                      | Where  | What it does                                                                                |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `SITE_URL`                    | Convex | Required. The CRM's public URL; used by auth, CORS and links in alerts                      |
| `JWT_PRIVATE_KEY`, `JWKS`     | Convex | Required. Convex Auth signing keys                                                          |
| `ALLOWED_EMAIL_DOMAINS`       | Convex | Comma-separated domains (e.g. `hypedrive.in`) that can join without an invite               |
| `LEAD_FORM_ORIGINS`           | Convex | Comma-separated origins allowed to post the demo form; defaults to `SITE_URL` and localhost |
| `LEAD_SLA_SECONDS`            | Convex | Speed-to-lead target before a lead is flagged as breached; default 300                      |
| `CALCOM_WEBHOOK_SECRET`       | Convex | Secret for the Cal.com booking webhook at `/webhooks/calcom` (`X-Cal-Signature-256`)        |
| `ALERT_SLACK_WEBHOOK_URL`     | Convex | Slack incoming webhook for new leads, demo bookings and SLA breaches                        |
| `ALERT_WEBHOOK_URL`           | Convex | Generic JSON webhook for the same events                                                    |
| `KYC_BASE_URL`                | Convex | KYC provider base URL for GSTIN and DIN lookups                                             |
| `KYC_API_TOKEN`               | Convex | KYC provider API token                                                                      |
| `KYC_HMAC_SECRET`             | Convex | Verifies signed KYC responses                                                               |
| `ENRICHMENT_SANDBOX`          | Convex | Set to `1` to return test data instead of calling the KYC provider (local only)             |
| `PLATFORM_WEBHOOK_SECRET`     | Convex | Secret for platform events at `/webhooks/platform` (`X-Hypedrive-Signature`)                |
| `NEXT_PUBLIC_CONVEX_URL`      | Next   | Required. Convex API URL (`CONVEX_CLOUD_ORIGIN`)                                            |
| `NEXT_PUBLIC_CONVEX_SITE_URL` | Next   | Convex HTTP-actions URL (`CONVEX_SITE_ORIGIN`); the demo form posts leads here              |
| `NEXT_PUBLIC_CALCOM_LINK`     | Next   | Cal.com booking link shown after the demo form                                              |
| `NEXT_PUBLIC_SITE_URL`        | Next   | Canonical URL for robots and the sitemap                                                    |

## Production

1. Run `docker-compose.convex.yml` on the server behind HTTPS. Set `INSTANCE_SECRET` (`openssl rand -hex 32`), `CONVEX_CLOUD_ORIGIN` (public API URL, e.g. `https://convex.example.com`) and `CONVEX_SITE_ORIGIN` (public HTTP-actions URL, e.g. `https://convex-site.example.com`). Set `POSTGRES_URL` to use Postgres instead of the default SQLite volume.
2. Generate an admin key, set the Convex variables above with the production `SITE_URL`, and deploy functions with `CONVEX_SELF_HOSTED_URL=… CONVEX_SELF_HOSTED_ADMIN_KEY=… npm run convex:deploy`.
3. Build the app with `NEXT_PUBLIC_CONVEX_URL` set to `CONVEX_CLOUD_ORIGIN` and `NEXT_PUBLIC_CONVEX_SITE_URL` set to `CONVEX_SITE_ORIGIN`.
4. Point Cal.com and the platform at `CONVEX_SITE_ORIGIN/webhooks/calcom` and `CONVEX_SITE_ORIGIN/webhooks/platform`.
