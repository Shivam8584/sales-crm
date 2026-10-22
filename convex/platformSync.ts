import { v } from "convex/values";
import {
  action,
  internalAction,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { personName } from "../lib/domain/labels";
import { fail, notFound } from "./lib/errors";
import { getViewer, internalMutation, memberQuery } from "./lib/functions";
import { stateEvents, upsertMember } from "./lib/platform";
import {
  PLATFORM_ENV_HINT,
  collectSnapshot,
  liveApi,
  platformMode,
  sandboxApi,
  type PlatformMode,
  type SandboxSource,
} from "./lib/platformClient";

/** Snapshots are large documents, one per linked account. */
const SNAPSHOT_SCAN = 1000;

const vSnapshotData = v.object({
  balancePaise: v.optional(v.number()),
  heldPaise: v.optional(v.number()),
  creditLimitPaise: v.optional(v.number()),
  paymentMode: v.optional(v.string()),
  campaigns: v.array(
    v.object({
      id: v.string(),
      title: v.string(),
      status: v.string(),
      pauseReason: v.optional(v.string()),
      enrolled: v.number(),
      max: v.optional(v.number()),
      pending: v.number(),
      approved: v.number(),
      submittedAt: v.optional(v.number()),
      endDate: v.optional(v.string()),
    }),
  ),
  deposits30d: v.number(),
  deposits90d: v.number(),
  depositCount90d: v.number(),
  staleReviews: v.number(),
  oldestReviewDays: v.optional(v.number()),
  disputes: v.number(),
  listings: v.array(
    v.object({
      marketplace: v.string(),
      count: v.number(),
      firstAt: v.number(),
      latestAt: v.number(),
    }),
  ),
  members: v.array(
    v.object({
      userId: v.string(),
      name: v.optional(v.string()),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      roles: v.array(v.string()),
    }),
  ),
});

type Target = { accountId: Id<"accounts">; orgId: string };

/** The account to sync, checked against the signed-in member. */
export const target = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }): Promise<Target> => {
    const viewer = await getViewer(ctx);
    if (!viewer) fail("unauthenticated", "Sign in to continue");
    if (viewer.status !== "active") {
      fail("forbidden", "Your access has been removed");
    }
    const account = await ctx.db.get(accountId);
    if (!account || account.archivedAt) notFound("Account");
    if (!account.platformOrgId) {
      fail(
        "invalid",
        `${account.name} isn't linked to a Hypedrive organisation`,
      );
    }
    return { accountId, orgId: account.platformOrgId };
  },
});

/** Every linked account, for the nightly sync. */
export const targets = internalQuery({
  args: {},
  handler: async (ctx): Promise<Target[]> => {
    const accounts = await ctx.db
      .query("accounts")
      .withIndex("by_platform_org", (q) => q.gt("platformOrgId", ""))
      .collect();
    return accounts.flatMap((account) =>
      account.archivedAt || !account.platformOrgId
        ? []
        : [{ accountId: account._id, orgId: account.platformOrgId }],
    );
  },
});

/** What the sandbox answers from: the org's events and the people already linked to it. */
export const sandboxSource = internalQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }): Promise<SandboxSource | null> => {
    const account = await ctx.db.get(accountId);
    const orgId = account?.platformOrgId;
    if (!account || !orgId) return null;
    const rows = await ctx.db
      .query("platformEvents")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const creator = rows.find(
      (row) => row.type === "organization.created",
    )?.userId;
    const people = (
      await ctx.db
        .query("people")
        .withIndex("by_account", (q) => q.eq("accountId", accountId))
        .collect()
    )
      .filter(
        (person) =>
          person.platformUserId && !person.archivedAt && !person.erasedAt,
      )
      .sort(
        (a, b) =>
          Number(b.platformUserId === creator) -
          Number(a.platformUserId === creator),
      )
      .map((person) => ({
        userId: person.platformUserId!,
        name: personName(person),
        email: person.email,
        phone: person.phone,
      }));
    return {
      orgId,
      name: account.name,
      domain: account.domain,
      events: stateEvents(rows),
      people,
    };
  },
});

export const store = internalMutation({
  args: {
    accountId: v.id("accounts"),
    orgId: v.string(),
    source: v.union(v.literal("live"), v.literal("sandbox")),
    now: v.number(),
    data: v.optional(vSnapshotData),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);
    if (
      !account ||
      account.archivedAt ||
      account.platformOrgId !== args.orgId
    ) {
      return null;
    }
    const existing = await ctx.db
      .query("platformSnapshots")
      .withIndex("by_account", (q) => q.eq("accountId", args.accountId))
      .first();
    if (!args.data) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          error: args.error ?? "Sync failed",
          attemptedAt: args.now,
        });
      }
      return null;
    }
    const doc = {
      accountId: args.accountId,
      orgId: args.orgId,
      source: args.source,
      fetchedAt: args.now,
      attemptedAt: args.now,
      error: undefined,
      ...args.data,
    };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("platformSnapshots", doc);

    let added = 0;
    for (const member of args.data.members) {
      const result = await upsertMember(ctx, account, member, args.now);
      if (result?.created) added++;
    }
    return { added };
  },
});

type SyncResult =
  | { ok: true; fetchedAt: number; peopleAdded: number; mode: PlatformMode }
  | { ok: false; error: string };

async function syncOne(
  ctx: ActionCtx,
  mode: PlatformMode,
  { accountId, orgId }: Target,
): Promise<SyncResult> {
  const now = Date.now();
  let error: string;
  try {
    let api;
    if (mode === "live") api = liveApi(process.env);
    else {
      const source = await ctx.runQuery(internal.platformSync.sandboxSource, {
        accountId,
      });
      if (!source) return { ok: false, error: "The account isn't linked" };
      api = sandboxApi(source, now);
    }
    const data = await collectSnapshot(api, orgId, now);
    if (data) {
      const stored = await ctx.runMutation(internal.platformSync.store, {
        accountId,
        orgId,
        source: mode,
        now,
        data,
      });
      return {
        ok: true,
        fetchedAt: now,
        peopleAdded: stored?.added ?? 0,
        mode,
      };
    }
    error = "The organisation wasn't found on Hypedrive";
  } catch (caught) {
    console.error(`Platform sync for ${orgId} failed`, caught);
    error =
      caught instanceof Error ? caught.message : "The platform sync failed";
  }
  await ctx.runMutation(internal.platformSync.store, {
    accountId,
    orgId,
    source: mode,
    now,
    error,
  });
  return { ok: false, error };
}

/** "Sync now" on an account: reads its organisation from the platform. */
export const syncNow = action({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }): Promise<SyncResult> => {
    const mode = platformMode(process.env);
    if (!mode)
      fail("forbidden", `Platform sync isn't configured. ${PLATFORM_ENV_HINT}`);
    const found: Target = await ctx.runQuery(internal.platformSync.target, {
      accountId,
    });
    return await syncOne(ctx, mode, found);
  },
});

/** Nightly: refreshes every linked account. */
export const syncAll = internalAction({
  args: {},
  handler: async (ctx) => {
    const mode = platformMode(process.env);
    if (!mode) return { skipped: true, synced: 0, failed: 0 };
    const list: Target[] = await ctx.runQuery(
      internal.platformSync.targets,
      {},
    );
    let synced = 0;
    let failed = 0;
    for (const item of list) {
      const result = await syncOne(ctx, mode, item);
      if (result.ok) synced++;
      else failed++;
    }
    return { skipped: false, synced, failed };
  },
});

/** Whether the pull sync is configured, and when it last ran, for the integrations page. */
export const status = memberQuery({
  args: {},
  handler: async (ctx) => {
    const latest = await ctx.db.query("platformSnapshots").take(SNAPSHOT_SCAN);
    const failing = latest.filter((snapshot) => snapshot.error);
    return {
      mode: platformMode(process.env),
      envHint: PLATFORM_ENV_HINT,
      snapshots: latest.length,
      lastFetchedAt: latest.length
        ? Math.max(...latest.map((snapshot) => snapshot.fetchedAt))
        : null,
      failing: failing.length,
      lastError: failing[0]?.error ?? null,
    };
  },
});
