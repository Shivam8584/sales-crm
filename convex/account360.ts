import { v } from "convex/values";
import { action, internalQuery, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { ROLE_RANK } from "../lib/domain/enums";
import { accountHealth } from "../lib/domain/health";
import { personName } from "../lib/domain/labels";
import { formatMoney } from "../lib/domain/money";
import {
  CAMPAIGN_STATUS_LABEL,
  ORG_ROLE_TITLE,
  PLATFORM_TRIGGER_LABEL,
  canonicalEvent,
  marketplaceLabel,
  type PlatformEventData,
  type PlatformEventType,
} from "../lib/domain/platform";
import { platformState } from "../lib/domain/platform-state";
import { syncAccountActivation } from "./lib/activation";
import { fail, invalid } from "./lib/errors";
import {
  adminQuery,
  getViewer,
  memberMutation,
  memberQuery,
} from "./lib/functions";
import {
  healthInput,
  isPlatformEvent,
  latestSnapshot,
  payloadOf,
  personByPlatformUser,
  primaryRole,
  retry,
  stateEvents,
} from "./lib/platform";
import { PLATFORM_ENV_HINT, platformMode } from "./lib/platformClient";
import { requireAccount } from "./lib/records";
import { logChanges } from "./lib/timeline";

const DAY = 24 * 60 * 60_000;
const IST_OFFSET = 330 * 60_000;
const WEEKS = 12;
const ORG_EVENT_LIMIT = 5000;
const RECENT_EVENTS = 20;
const NEW_WINDOW = 30 * DAY;
/** Hypedrive organisation ids are TypeIDs: `org_` and a 26-character suffix. */
const ORG_ID = /^org_[0-9a-z]{26}$/;
const SYNC_SCHEDULE = "Nightly at 3:00 am IST";

const inr = (amount: number) => ({ amount, currency: "INR" as const });
const rupees = (paise: number) => formatMoney(inr(paise));

/** Monday 00:00 IST of the week `at` falls in. */
function weekStart(at: number) {
  const day = Math.floor((at + IST_OFFSET) / DAY);
  const monday = day - ((day + 3) % 7);
  return monday * DAY - IST_OFFSET;
}

function depositWeeks(funding: { at: number; amount: number }[], now: number) {
  const current = weekStart(now);
  const weeks = Array.from({ length: WEEKS }, (_, index) => ({
    start: current - (WEEKS - 1 - index) * 7 * DAY,
    amount: 0,
    count: 0,
  }));
  for (const item of funding) {
    const index =
      WEEKS - 1 - Math.round((current - weekStart(item.at)) / (7 * DAY));
    if (index < 0 || index >= WEEKS) continue;
    weeks[index].amount += item.amount;
    weeks[index].count += 1;
  }
  return weeks.map((week) => ({ ...week, amount: inr(week.amount) }));
}

type EventTone = "good" | "warn" | "bad" | "neutral";

const str = (value: unknown) =>
  typeof value === "string" && value ? value : undefined;
const num = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** One line for the account's platform feed: what happened and the figure that matters. */
function eventLine(
  type: PlatformEventType,
  data: Record<string, unknown>,
): { title: string; detail?: string; tone: EventTone } {
  const canonical = canonicalEvent(
    type,
    data as PlatformEventData[PlatformEventType],
  );
  if (!canonical) return { title: "GST verified", tone: "good" };
  const title = PLATFORM_TRIGGER_LABEL[canonical.type];
  switch (canonical.type) {
    case "campaign.status_changed": {
      const { to, pause_reason: reason, title: name } = canonical.data;
      const starved = to === "paused" && reason === "insufficient_funds";
      return {
        title: starved
          ? "Campaign paused for insufficient funds"
          : `Campaign ${CAMPAIGN_STATUS_LABEL[to].toLowerCase()}${to === "paused" && reason === "brand_paused" ? " by the brand" : ""}`,
        detail: name,
        tone: starved
          ? "bad"
          : to === "live" || to === "scheduled"
            ? "good"
            : to === "changes_requested" || to === "rejected" || to === "paused"
              ? "warn"
              : "neutral",
      };
    }
    case "wallet.topup_succeeded":
    case "wallet.deposit_received":
      return {
        title,
        detail: rupees(num(canonical.data.amount_paise) ?? 0),
        tone: "good",
      };
    case "wallet.low_balance":
    case "wallet.negative":
    case "wallet.recovered": {
      const balance = num(canonical.data.balance_paise);
      return {
        title,
        detail:
          balance === undefined ? undefined : `${rupees(balance)} balance`,
        tone:
          canonical.type === "wallet.recovered"
            ? "good"
            : canonical.type === "wallet.negative"
              ? "bad"
              : "warn",
      };
    }
    case "campaign.slots_filled":
    case "enrollment.approved":
      return { title, detail: str(canonical.data.title), tone: "good" };
    case "enrollment.review_overdue": {
      const count = num(canonical.data.count) ?? 0;
      const days = num(canonical.data.oldest_days) ?? 0;
      return {
        title: `${count} ${count === 1 ? "result" : "results"} waiting for review`,
        detail: [str(canonical.data.title), `oldest ${days} days`]
          .filter(Boolean)
          .join(" · "),
        tone: days >= 14 ? "bad" : "warn",
      };
    }
    case "listing.created":
      return {
        title,
        detail: [
          marketplaceLabel(canonical.data.platform_slug),
          str(canonical.data.name),
        ]
          .filter(Boolean)
          .join(" · "),
        tone: "neutral",
      };
    case "member.joined":
      return {
        title,
        detail: [
          str(canonical.data.name) ?? str(canonical.data.email),
          ORG_ROLE_TITLE[canonical.data.role] ?? canonical.data.role,
        ]
          .filter(Boolean)
          .join(" · "),
        tone: "good",
      };
    case "organization.created":
      return { title, detail: str(canonical.data.name), tone: "good" };
    case "organization.gst_failed":
      return { title, detail: str(canonical.data.reason), tone: "bad" };
    case "user.signed_up":
      return {
        title,
        detail: str(canonical.data.name) ?? str(canonical.data.email),
        tone: "neutral",
      };
  }
}

async function orgEvents(ctx: QueryCtx, orgId: string) {
  return await ctx.db
    .query("platformEvents")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .take(ORG_EVENT_LIMIT);
}

/** Everything the account's Platform tab shows, from the latest snapshot and the org's events. */
export const platform = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) => {
    const account = await requireAccount(ctx, accountId);
    const orgId = account.platformOrgId;
    const syncMode = platformMode(process.env);
    if (!orgId) return { linked: false as const, syncMode };

    const now = Date.now();
    const events = await orgEvents(ctx, orgId);
    const list = stateEvents(events);
    const state = platformState(list, now);
    const snapshot = await latestSnapshot(ctx, accountId);
    const input = healthInput(account, list, snapshot, now);
    const health = accountHealth(input);

    const counts = new Map(
      (snapshot?.campaigns ?? []).map((item) => [item.id, item]),
    );
    const lifecycle = new Map(state.campaigns.map((item) => [item.id, item]));
    const reviews = new Map(
      state.reviews.map((item) => [item.campaignId, item]),
    );
    const campaigns = input.campaigns.map((item) => {
      const row = counts.get(item.id);
      const life = lifecycle.get(item.id);
      const review = reviews.get(item.id);
      return {
        id: item.id,
        title: item.title || "Untitled campaign",
        status: item.status,
        pauseReason: item.pauseReason ?? null,
        enrolled: row?.enrolled ?? null,
        max: row?.max ?? null,
        approved: row?.approved ?? null,
        pending: row?.pending ?? null,
        fillPct: item.fillPct,
        submittedAt: row?.submittedAt ?? life?.submittedAt ?? null,
        startedAt: life?.liveAt ?? null,
        endDate: row?.endDate ?? null,
        endedAt: life?.endedAt ?? null,
        staleReviews: review?.count ?? 0,
        oldestReviewDays: review?.oldestDays ?? null,
      };
    });

    const funding = list.flatMap((event) =>
      event.type === "wallet.topup_succeeded" ||
      event.type === "wallet.deposit_received"
        ? [{ at: event.occurredAt, amount: num(event.data?.amount_paise) ?? 0 }]
        : [],
    );

    const markets = new Map<
      string,
      { count: number; firstAt: number; latestAt: number }
    >();
    for (const item of snapshot?.listings ?? []) {
      markets.set(item.marketplace, {
        count: item.count,
        firstAt: item.firstAt,
        latestAt: item.latestAt,
      });
    }
    const fetchedAt = snapshot?.fetchedAt ?? 0;
    for (const item of state.listings) {
      const known = markets.get(item.slug);
      if (known && item.at <= fetchedAt) continue;
      markets.set(item.slug, {
        count: (known?.count ?? 0) + 1,
        firstAt: Math.min(known?.firstAt ?? item.at, item.at),
        latestAt: Math.max(known?.latestAt ?? item.at, item.at),
      });
    }
    const firstMarket = Math.min(
      ...[...markets.values()].map((item) => item.firstAt),
    );
    const listings = [...markets]
      .map(([slug, item]) => ({
        slug,
        label: marketplaceLabel(slug),
        ...item,
        newMarketplace:
          item.firstAt > firstMarket && now - item.firstAt <= NEW_WINDOW,
        newListing: now - item.latestAt <= NEW_WINDOW,
      }))
      .sort((a, b) => b.count - a.count || a.firstAt - b.firstAt);

    const joined = new Map(state.members.map((item) => [item.userId, item.at]));
    const byUser = new Map<
      string,
      Doc<"platformSnapshots">["members"][number]
    >();
    for (const member of snapshot?.members ?? []) {
      const seen = byUser.get(member.userId);
      byUser.set(
        member.userId,
        seen
          ? {
              ...member,
              ...seen,
              roles: [...new Set([...seen.roles, ...member.roles])],
            }
          : member,
      );
    }
    const members = await Promise.all(
      [...byUser.values()].map(async (member) => {
        const person = await personByPlatformUser(ctx, member.userId);
        const visible = person && !person.erasedAt;
        return {
          userId: member.userId,
          name: member.name ?? null,
          email: member.email ?? null,
          role: primaryRole(member.roles),
          roles: member.roles,
          joinedAt: joined.get(member.userId) ?? null,
          person: visible
            ? {
                _id: person._id,
                name: personName(person),
                onAccount: person.accountId === accountId,
              }
            : null,
        };
      }),
    );

    const recent = events
      .filter(
        (event) =>
          event.processedAt && !event.ignored && isPlatformEvent(event.type),
      )
      .sort((a, b) => b.occurredAt - a.occurredAt)
      .slice(0, RECENT_EVENTS)
      .map((event) => ({
        _id: event._id,
        type: event.type,
        occurredAt: event.occurredAt,
        ...eventLine(event.type as PlatformEventType, payloadOf(event)),
      }));

    return {
      linked: true as const,
      syncMode,
      orgId,
      snapshot: snapshot
        ? {
            fetchedAt: snapshot.fetchedAt,
            attemptedAt: snapshot.attemptedAt ?? null,
            source: snapshot.source,
            error: snapshot.error ?? null,
          }
        : null,
      health,
      wallet: {
        status: input.wallet,
        balance: input.balancePaise === null ? null : inr(input.balancePaise),
        held:
          snapshot?.heldPaise === undefined ? null : inr(snapshot.heldPaise),
        creditLimit:
          snapshot?.creditLimitPaise === undefined
            ? null
            : inr(snapshot.creditLimitPaise),
        paymentMode: snapshot?.paymentMode ?? null,
      },
      campaigns,
      reviews: {
        count: input.staleReviews,
        oldestDays: input.oldestReviewDays,
      },
      disputes: input.disputes,
      deposits: {
        last30: inr(input.deposits30dPaise),
        last90: inr(input.deposits90dPaise),
        count90: snapshot
          ? snapshot.depositCount90d
          : funding.filter((item) => now - item.at <= 90 * DAY).length,
        lifetime: inr(state.funding.totalPaise),
        lifetimeCount: state.funding.count,
        weeks: depositWeeks(funding, now),
      },
      listings,
      members,
      events: recent,
      lastEventAt: state.lastEventAt,
    };
  },
});

/** Links an account to its Hypedrive organisation, or unlinks it with `null`. Returns the previous id for undo. */
export const linkOrg = memberMutation({
  args: { accountId: v.id("accounts"), orgId: v.union(v.string(), v.null()) },
  handler: async (ctx, { accountId, orgId: raw }) => {
    const account = await requireAccount(ctx, accountId);
    const previous = account.platformOrgId ?? null;
    const orgId = raw === null ? null : raw.trim().toLowerCase();
    if (orgId !== null) {
      if (!orgId) invalid("orgId", "Enter the organisation ID");
      if (!ORG_ID.test(orgId)) {
        invalid(
          "orgId",
          "That isn't a Hypedrive organisation ID. It starts with org_ and has 26 more letters and digits.",
        );
      }
      const taken = (
        await ctx.db
          .query("accounts")
          .withIndex("by_platform_org", (q) => q.eq("platformOrgId", orgId))
          .take(5)
      ).find((row) => row._id !== accountId && !row.archivedAt);
      if (taken) {
        invalid(
          "orgId",
          `${taken.name} is already linked to this organisation`,
        );
      }
    }
    if (orgId === previous) return { previous };

    await ctx.db.patch(accountId, {
      platformOrgId: orgId ?? undefined,
      updatedAt: Date.now(),
    });
    // A snapshot of the previous organisation would otherwise pass as this one's until the next sync.
    const stale = await ctx.db
      .query("platformSnapshots")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect();
    for (const snapshot of stale) {
      if (snapshot.orgId !== orgId) await ctx.db.delete(snapshot._id);
    }
    await logChanges(ctx, { accountId }, ctx.viewer._id, [
      {
        field: "Hypedrive organisation",
        from: previous ?? undefined,
        to: orgId ?? undefined,
      },
    ]);
    if (orgId) {
      const waiting = (await orgEvents(ctx, orgId)).filter(
        (event) => !event.processedAt && !event.ignored,
      );
      if (waiting.length) await retry(ctx, waiting);
    }
    await syncAccountActivation(ctx, accountId, Date.now());
    return { previous };
  },
});

/** Pull-sync health for the integrations page: mode, last run and every account that failed or never synced. */
export const syncOverview = adminQuery({
  args: {},
  handler: async (ctx) => {
    const linked = (
      await ctx.db
        .query("accounts")
        .withIndex("by_platform_org", (q) => q.gt("platformOrgId", ""))
        .collect()
    ).filter((account) => !account.archivedAt);
    const rows = await Promise.all(
      linked.map(async (account) => ({
        account,
        snapshot: await latestSnapshot(ctx, account._id),
      })),
    );
    const attempts = rows.flatMap(({ snapshot }) =>
      snapshot ? [snapshot.attemptedAt ?? snapshot.fetchedAt] : [],
    );
    const issue = ({
      account,
      snapshot,
    }: {
      account: Doc<"accounts">;
      snapshot: Doc<"platformSnapshots"> | null;
    }) => ({
      accountId: account._id as Id<"accounts">,
      name: account.name,
      orgId: account.platformOrgId!,
      error: snapshot?.error ?? null,
      fetchedAt: snapshot?.fetchedAt ?? null,
      attemptedAt: snapshot?.attemptedAt ?? null,
    });
    return {
      mode: platformMode(process.env),
      envHint: PLATFORM_ENV_HINT,
      schedule: SYNC_SCHEDULE,
      linked: linked.length,
      synced: rows.filter(({ snapshot }) => snapshot && !snapshot.error).length,
      lastRunAt: attempts.length ? Math.max(...attempts) : null,
      failures: rows
        .filter(({ snapshot }) => snapshot?.error)
        .map(issue)
        .sort((a, b) => (b.attemptedAt ?? 0) - (a.attemptedAt ?? 0)),
      neverSynced: rows.filter(({ snapshot }) => !snapshot).map(issue),
    };
  },
});

export const requireAdmin = internalQuery({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) fail("unauthenticated", "Sign in to continue");
    if (
      viewer.status !== "active" ||
      ROLE_RANK[viewer.role] < ROLE_RANK.admin
    ) {
      fail("forbidden", "Only admins can run the platform sync");
    }
    return null;
  },
});

/** "Run sync now" on the integrations page: the nightly sync, on demand. Admins only. */
export const runSync = action({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ skipped: boolean; synced: number; failed: number }> => {
    await ctx.runQuery(internal.account360.requireAdmin, {});
    if (!platformMode(process.env)) {
      fail("forbidden", `Platform sync isn't configured. ${PLATFORM_ENV_HINT}`);
    }
    return await ctx.runAction(internal.platformSync.syncAll, {});
  },
});
