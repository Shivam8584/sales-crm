import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { adminMutation, adminQuery } from "./lib/functions";
import { aiModels } from "./lib/ai";
import { accountCounts, leadCounts, peopleCounts } from "./lib/counts";
import { emailProvider, whatsappProvider } from "./lib/automations/delivery";
import { providerMode } from "./lib/enrichment/kyc";
import { platformMode } from "./lib/platformClient";
import { scraperMode } from "./lib/scraper";
import { secretEnv } from "./lib/secrets";
import { literals } from "./lib/validators";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const COUNT_CAP = 5000;
const SCAN = 1000;
const EVENT_SCAN = 2000;
const MESSAGES = 20;
const RUNS = 10;
const RUN_SCAN = 200;

function target(run: Doc<"enrichmentRuns">) {
  if (run.accountId) return "account" as const;
  if (run.personId) return "person" as const;
  return run.leadId ? ("lead" as const) : null;
}

/** Service health and recent failures. Labels and booleans only; no secret leaves the server. */
export const overview = adminQuery({
  args: {},
  handler: async (ctx) => {
    const env = await secretEnv(ctx);
    const since = Date.now() - WEEK_MS;

    const subscriptions = await ctx.db.query("pushSubscriptions").take(SCAN);
    const snapshots = await ctx.db.query("platformSnapshots").take(SCAN);
    const syncFailing = snapshots.filter((snapshot) => snapshot.error);
    const email = emailProvider();
    const whatsapp = whatsappProvider();

    const events = await ctx.db
      .query("platformEvents")
      .order("desc")
      .take(EVENT_SCAN);

    const failedMessages = await ctx.db
      .query("automationMessages")
      .withIndex("by_status", (q) =>
        q.eq("status", "failed").gte("_creationTime", since),
      )
      .order("desc")
      .take(MESSAGES);
    const automations = new Map<Id<"automations">, string>();
    for (const id of new Set(failedMessages.map((m) => m.automationId))) {
      const automation = await ctx.db.get(id);
      if (automation) automations.set(id, automation.name);
    }

    const recentRuns = await ctx.db
      .query("enrichmentRuns")
      .withIndex("by_creation_time", (q) => q.gte("_creationTime", since))
      .order("desc")
      .take(RUN_SCAN);

    const [active, deactivated] = await Promise.all(
      (["active", "deactivated"] as const).map(
        async (status) =>
          (
            await ctx.db
              .query("members")
              .withIndex("by_status", (q) => q.eq("status", status))
              .take(SCAN)
          ).length,
      ),
    );

    return {
      services: {
        email: {
          provider: email.provider === "outbox" ? null : email.provider,
          problem: email.problem ?? null,
        },
        whatsapp: {
          provider: whatsapp.provider === "outbox" ? null : whatsapp.provider,
          problem: whatsapp.problem ?? null,
        },
        push: {
          configured: Boolean(
            process.env.VAPID_PUBLIC_KEY?.trim() &&
            process.env.VAPID_PRIVATE_KEY?.trim() &&
            process.env.VAPID_SUBJECT?.trim(),
          ),
          subscriptions: subscriptions.length,
        },
        platformSync: {
          mode: platformMode(process.env),
          lastFetchedAt: snapshots.length
            ? Math.max(...snapshots.map((snapshot) => snapshot.fetchedAt))
            : null,
          failing: syncFailing.length,
          lastError: syncFailing[0]?.error ?? null,
        },
        enrichment: providerMode(env),
        scraper: scraperMode(process.env),
        ai: {
          configured: Boolean(env.OPENAI_API_KEY?.trim()),
          ...aiModels(env),
        },
      },
      failures: {
        messages: failedMessages.map((message) => ({
          _id: message._id,
          automation:
            automations.get(message.automationId) ?? "Deleted automation",
          channel: message.channel,
          target: message.personId ? "person" : message.leadId ? "lead" : null,
          error: message.error ?? "No reason recorded",
          at: message._creationTime,
        })),
        runs: recentRuns
          .filter((run) => run.status === "failed")
          .slice(0, RUNS)
          .map((run) => ({
            _id: run._id,
            provider: run.provider,
            target: target(run),
            error: run.error ?? "No reason recorded",
            at: run.finishedAt ?? run._creationTime,
          })),
        platformEvents: events.filter(
          (event) => !event.processedAt && event.error,
        ).length,
      },
      members: { active, deactivated },
    };
  },
});

const vCountTable = literals(["accounts", "people", "leads"]);

/** One table's count aggregate against a bounded read of the table itself. */
export const dataCheck = adminQuery({
  args: { table: vCountTable },
  handler: async (ctx, { table }) => {
    const aggregate =
      table === "accounts"
        ? await accountCounts.count(ctx)
        : table === "people"
          ? await peopleCounts.count(ctx)
          : await leadCounts.count(ctx);
    const rows = await ctx.db.query(table).take(COUNT_CAP + 1);
    const capped = rows.length > COUNT_CAP;
    return {
      table,
      aggregate,
      actual: capped ? `${COUNT_CAP}+` : rows.length,
      ok: capped ? aggregate >= COUNT_CAP : aggregate === rows.length,
    };
  },
});

export const rebuildCounts = adminMutation({
  args: { table: vCountTable },
  handler: async (ctx, { table }) => {
    await ctx.scheduler.runAfter(0, internal.counts.rebuild, { table });
  },
});
