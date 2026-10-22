import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  DEAL_STAGES,
  LEAD_KINDS,
  LEAD_STATUSES,
  LIFECYCLE_STAGES,
  TIMELINE_KINDS,
} from "../lib/domain/enums";
import { istToday } from "../lib/domain/day";
import { money } from "../lib/domain/money";
import { fail } from "./lib/errors";
import { internalMutation } from "./lib/functions";
import { personSearchText } from "./lib/records";

/**
 * Load-test data for local deployments: `npx convex run perf:seed` adds 5k
 * accounts, people and leads, 2k deals, 20k timeline entries and a platform
 * org with events for one account in five, in batches;
 * `npx convex run perf:wipe` empties the app tables a batch at a time, after
 * which `seed:reset` restores the demo.
 */

const BATCHES = 50;
const PER_BATCH = 100;
const DEALS_PER_BATCH = 40;
const ENTRIES_PER_ACCOUNT = 3.6;
const HOT_ENTRIES = 2_000;
const PLATFORM_EVERY = 5;
const DAY = 24 * 60 * 60_000;
const WORDS = [
  "Amber",
  "Basil",
  "Cedar",
  "Delta",
  "Ember",
  "Fern",
  "Glow",
  "Haze",
  "Indigo",
  "Jade",
  "Kesar",
  "Lotus",
];

function requireLocal() {
  const site = process.env.SITE_URL ?? "";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(site)) {
    fail("forbidden", "perf data only runs on localhost");
  }
}

const pick = <T>(items: readonly T[], n: number) => items[n % items.length];

export const seed = internalMutation({
  args: { batch: v.optional(v.number()) },
  handler: async (ctx, { batch = 0 }) => {
    requireLocal();
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    if (members.length === 0) fail("invalid", "Sign in once first");
    const now = Date.now();
    let entries = 0;
    for (let k = 0; k < PER_BATCH; k++) {
      const i = batch * PER_BATCH + k;
      const owner = pick(members, i)._id;
      const name = `${pick(WORDS, i)} ${pick(WORDS, i * 7 + 3)} Perf ${i}`;
      const lastActivityAt = now - (i % 120) * DAY;
      const onPlatform = i % PLATFORM_EVERY === 1;
      const accountId = await ctx.db.insert("accounts", {
        name,
        domain: `perf-${i}.example`,
        ownerId: owner,
        platformOrgId: onPlatform ? `perf-org-${i}` : undefined,
        stage: pick(LIFECYCLE_STAGES, i),
        tags: ["perf"],
        lastActivityAt,
        updatedAt: now,
      });
      const person = {
        firstName: pick(WORDS, i * 3),
        lastName: `Perf${i}`,
        email: `perf-${i}@perf.example`,
        title: "Buyer",
      };
      await ctx.db.insert("people", {
        ...person,
        accountId: i % 5 === 0 ? undefined : accountId,
        platformUserId: onPlatform ? `perf-user-${i}` : undefined,
        ownerId: owner,
        tags: ["perf"],
        lastActivityAt,
        updatedAt: now,
        searchText: personSearchText(person, name),
      });
      await ctx.db.insert("leads", {
        kind: pick(LEAD_KINDS, i),
        name: `${pick(WORDS, i * 5)} Lead ${i}`,
        email: `perf-lead-${i}@perf.example`,
        companyName: name,
        source: "perf",
        utm: {},
        status: pick(LEAD_STATUSES, i),
        ownerId: i % 4 === 0 ? undefined : owner,
        firstTouchedAt: i % 3 === 0 ? undefined : now - (i % 30) * DAY,
      });
      if (onPlatform) {
        const orgId = `perf-org-${i}`;
        const userId = `perf-user-${i}`;
        const at = now - (i % 100) * DAY;
        const events: [string, number, Record<string, unknown>][] = [
          ["user.signed_up", 0, { user_id: userId }],
          ["organization.created", 1, { org_id: orgId, created_by: userId }],
          ["wallet.deposit_received", 2, { org_id: orgId }],
          [
            "campaign.status_changed",
            3,
            { org_id: orgId, campaign_id: "c1", to: "live" },
          ],
          ["enrollment.approved", 4, { org_id: orgId, campaign_id: "c1" }],
          ["enrollment.approved", 5, { org_id: orgId, campaign_id: "c1" }],
          ["listing.created", 6, { org_id: orgId }],
          ["member.joined", 7, { org_id: orgId }],
        ];
        for (const [type, n, data] of events) {
          await ctx.db.insert("platformEvents", {
            eventId: `perf-${i}-${n}`,
            type,
            orgId: type === "user.signed_up" ? undefined : orgId,
            userId: type === "user.signed_up" ? userId : undefined,
            occurredAt: at + n * 3_600_000,
            payload: JSON.stringify(data),
            processedAt: now,
          });
        }
      }
      const taskStatus = pick(["todo", "in_progress", "done"] as const, i);
      await ctx.db.insert("tasks", {
        title: `Follow up with ${name}`,
        status: taskStatus,
        priority: "normal",
        assigneeId: owner,
        dueDate: istToday((i % 60) - 30, now),
        accountId,
        position: i,
        completedAt: taskStatus === "done" ? now - (i % 30) * DAY : undefined,
        updatedAt: now,
      });
      if (k < DEALS_PER_BATCH) {
        const stage = pick(DEAL_STAGES, i);
        const closed = stage === "won" || stage === "lost";
        await ctx.db.insert("deals", {
          accountId,
          title: `${name} pilot`,
          stage,
          amount: money(10_000 + (i % 50) * 5_000),
          ownerId: owner,
          closeDate: istToday((i % 120) - 60, now),
          personIds: [],
          position: i,
          closedAt: closed ? now - (i % 90) * DAY : undefined,
          updatedAt: now,
        });
      }
      const count =
        i === 0
          ? HOT_ENTRIES
          : Math.floor(ENTRIES_PER_ACCOUNT * (k + 1)) -
            Math.floor(ENTRIES_PER_ACCOUNT * k);
      for (let e = 0; e < count; e++) {
        await ctx.db.insert("timeline", {
          kind: pick(TIMELINE_KINDS, e),
          accountId,
          actorId: owner,
          occurredAt: now - ((e * 37) % 180) * DAY - e * 1000,
          subject: "logged a perf entry",
          body: `Entry ${e} for ${name}`,
        });
        entries++;
      }
    }
    if (batch + 1 < BATCHES) {
      await ctx.scheduler.runAfter(0, internal.perf.seed, { batch: batch + 1 });
    }
    return { batch, entries };
  },
});

const WIPE_TABLES = [
  "platformEvents",
  "activationStages",
  "timeline",
  "tasks",
  "deals",
  "leads",
  "people",
  "accounts",
] as const;
const WIPE_BATCH = 100;

/** Deletes the perf-sized tables a batch at a time; then run `seed:reset`. */
export const wipe = internalMutation({
  args: {},
  handler: async (ctx) => {
    requireLocal();
    for (const table of WIPE_TABLES) {
      const docs = await ctx.db.query(table).take(WIPE_BATCH);
      if (docs.length === 0) continue;
      for (const doc of docs) await ctx.db.delete(doc._id);
      await ctx.scheduler.runAfter(0, internal.perf.wipe, {});
      return { table, deleted: docs.length };
    }
    return null;
  },
});
