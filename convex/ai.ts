import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action, type ActionCtx, type QueryCtx } from "./_generated/server";
import { findAccounts } from "./accounts";
import { findDeals } from "./deals";
import { findPeople } from "./people";
import { generate } from "./lib/ai";
import {
  contextHash,
  dayOrNull,
  firstName,
  pickByName,
  todayLine,
  truncate,
  withoutErased,
  wrapData,
} from "./lib/aiContext";
import {
  BRIEF,
  CALL,
  CAPTURE,
  EMAIL,
  NEXT,
  WHATSAPP,
  type BriefOut,
  type CallOut,
  type CaptureOut,
  type DraftOut,
  type NextOut,
} from "./lib/aiPrompts";
import type {
  Brief,
  CallSummary,
  Capture,
  Draft,
  NextAction,
} from "./lib/aiTypes";
import { fail, invalid } from "./lib/errors";
import { getViewer, internalMutation, memberQuery } from "./lib/functions";
import { rateLimiter } from "./lib/rateLimiter";
import { requireAccount, requirePerson } from "./lib/records";
import { istDay, istToday } from "../lib/domain/day";
import {
  DEAL_STAGE_LABEL,
  LEAD_KIND_LABEL,
  LEAD_STATUS_LABEL,
  STAGE_LABEL,
  personName,
} from "../lib/domain/labels";
import { formatMoney } from "../lib/domain/money";
import { isDealClosed } from "../lib/domain/transitions";

export const vTarget = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ personId: v.id("people") }),
  v.object({ leadId: v.id("leads") }),
  v.object({ dealId: v.id("deals") }),
);

const vKind = v.union(v.literal("brief"), v.literal("next"));

const BRIEF_TTL = 6 * 60 * 60_000;
const NEXT_TTL = 60 * 60_000;
const TIMELINE = 25;
const BODY = 400;
const PER_KIND = 4;
const CAPTURE_ITEMS = 10;
const NOTES_MAX = 8000;

const unavailable = (): never =>
  fail("unavailable", "AI is not set up on this server");

async function cacheRow(ctx: QueryCtx, kind: "brief" | "next", key: string) {
  return await ctx.db
    .query("aiCache")
    .withIndex("by_kind_key", (q) => q.eq("kind", kind).eq("key", key))
    .first();
}

/** Whether an AI key is configured; the UI hides every AI surface when false. */
export const enabled = memberQuery({
  args: {},
  handler: async () => Boolean(process.env.OPENAI_API_KEY?.trim()),
});

/** The cached brief for an account, or null if none has been generated. */
export const brief = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }): Promise<Brief | null> => {
    const row = await cacheRow(ctx, "brief", accountId);
    return row ? { ...(row.data as Omit<Brief, "at">), at: row.at } : null;
  },
});

/** Cached one-line suggestions for the viewer's Today items, keyed by record key (`leads:<id>`, `accounts:<id>`, `deals:<id>`). */
export const nextActions = memberQuery({
  args: {},
  handler: async (ctx): Promise<Record<string, NextAction>> => {
    const row = await cacheRow(ctx, "next", ctx.viewer._id);
    if (!row) return {};
    return Object.fromEntries(
      Object.entries(row.data as Record<string, string>).map(([key, text]) => [
        key,
        { text, at: row.at },
      ]),
    );
  },
});

/** What is cached for the viewer's own list or for an account, and the key to write it under. */
export const cached = memberQuery({
  args: { kind: vKind, accountId: v.optional(v.id("accounts")) },
  handler: async (ctx, { kind, accountId }) => {
    const key = accountId ?? ctx.viewer._id;
    const row = await cacheRow(ctx, kind, key);
    return { key, hash: row?.hash ?? null, at: row?.at ?? 0 };
  },
});

export const store = internalMutation({
  args: { kind: vKind, key: v.string(), hash: v.string(), data: v.any() },
  handler: async (ctx, { kind, key, hash, data }) => {
    const row = await cacheRow(ctx, kind, key);
    const next = { hash, data, at: Date.now() };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("aiCache", { kind, key, ...next });
  },
});

/** Spends one of the caller's daily AI calls; actions can't use the rate limiter directly. */
export const consume = internalMutation({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    if (!viewer) fail("unauthenticated", "Sign in to continue");
    if (viewer.status !== "active") {
      fail("forbidden", "Your access has been removed");
    }
    const { ok } = await rateLimiter.limit(ctx, "ai", { key: viewer._id });
    if (!ok) fail("rate_limited", "Daily AI limit reached");
  },
});

async function timelineRows(ctx: QueryCtx, entries: Doc<"timeline">[]) {
  const people = new Map<Id<"people">, Doc<"people"> | null>();
  const leads = new Map<Id<"leads">, Doc<"leads"> | null>();
  for (const entry of entries) {
    if (entry.personId && !people.has(entry.personId)) {
      people.set(entry.personId, await ctx.db.get(entry.personId));
    }
    if (entry.leadId && !leads.has(entry.leadId)) {
      leads.set(entry.leadId, await ctx.db.get(entry.leadId));
    }
  }
  const erased = new Set<string>();
  for (const [id, row] of [...people, ...leads])
    if (row?.erasedAt) erased.add(id);
  return withoutErased(entries, erased).map((entry) => {
    const person = entry.personId ? people.get(entry.personId) : null;
    return {
      kind: entry.kind,
      occurredAt: istDay(entry.occurredAt),
      direction: entry.direction ?? null,
      about: person ? personName(person) : null,
      subject: truncate(entry.subject, 160) || null,
      body: truncate(entry.body, BODY) || null,
    };
  });
}

async function accountFacts(ctx: QueryCtx, account: Doc<"accounts">) {
  const [owner, people, deals, tasks, entries] = await Promise.all([
    ctx.db.get(account.ownerId),
    ctx.db
      .query("people")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .take(40),
    ctx.db
      .query("deals")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .take(40),
    ctx.db
      .query("tasks")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .take(60),
    ctx.db
      .query("timeline")
      .withIndex("by_account", (q) => q.eq("accountId", account._id))
      .order("desc")
      .take(TIMELINE),
  ]);
  return {
    name: account.name,
    website: account.domain ?? null,
    stage: STAGE_LABEL[account.stage],
    tags: account.tags,
    gstin: account.gstin ?? null,
    owner: owner?.name ?? null,
    people: people
      .filter((person) => !person.archivedAt && !person.erasedAt)
      .map((person) => ({
        name: personName(person),
        title: person.title ?? null,
        email: person.email ?? null,
        phone: person.phone ?? null,
      })),
    openDeals: deals
      .filter((deal) => !isDealClosed(deal.stage))
      .map((deal) => ({
        title: deal.title,
        stage: DEAL_STAGE_LABEL[deal.stage],
        amount: formatMoney(deal.amount),
        closeDate: deal.closeDate ?? null,
      })),
    openTasks: tasks
      .filter((task) => task.status !== "done")
      .map((task) => ({ title: task.title, dueDate: task.dueDate ?? null })),
    timeline: await timelineRows(ctx, entries),
  };
}

/** The CRM side of an account brief; the platform side is added by the action. */
export const accountContext = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }) =>
    await accountFacts(ctx, await requireAccount(ctx, accountId)),
});

/** Context for drafting or summarising about one record. Erased people and leads are refused. */
export const targetContext = memberQuery({
  args: { target: vTarget },
  handler: async (ctx, { target }) => {
    const me = firstName(ctx.viewer.name);
    const recent = async (entries: Promise<Doc<"timeline">[]>) =>
      await timelineRows(ctx, await entries);

    if ("accountId" in target) {
      const account = await requireAccount(ctx, target.accountId);
      return { me, account: await accountFacts(ctx, account) };
    }
    if ("personId" in target) {
      const { personId } = target;
      const person = await requirePerson(ctx, personId);
      if (person.erasedAt) fail("forbidden", "This person's data was erased");
      const account = person.accountId
        ? await ctx.db.get(person.accountId)
        : null;
      return {
        me,
        person: {
          name: personName(person),
          title: person.title ?? null,
          email: person.email ?? null,
          phone: person.phone ?? null,
          tags: person.tags,
        },
        account: account && {
          name: account.name,
          stage: STAGE_LABEL[account.stage],
        },
        timeline: await recent(
          ctx.db
            .query("timeline")
            .withIndex("by_person", (q) => q.eq("personId", personId))
            .order("desc")
            .take(TIMELINE),
        ),
      };
    }
    if ("leadId" in target) {
      const { leadId } = target;
      const lead = await ctx.db.get(leadId);
      if (!lead) fail("not_found", "Lead not found");
      if (lead.erasedAt) fail("forbidden", "This lead's data was erased");
      return {
        me,
        lead: {
          name: lead.name,
          company: lead.companyName,
          website: lead.website ?? null,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          kind: LEAD_KIND_LABEL[lead.kind],
          status: LEAD_STATUS_LABEL[lead.status],
          source: lead.source,
          receivedOn: istDay(lead._creationTime),
          message: truncate(lead.message, 600) || null,
        },
        timeline: await recent(
          ctx.db
            .query("timeline")
            .withIndex("by_lead", (q) => q.eq("leadId", leadId))
            .order("desc")
            .take(TIMELINE),
        ),
      };
    }
    const { dealId } = target;
    const deal = await ctx.db.get(dealId);
    if (!deal) fail("not_found", "Deal not found");
    const account = await ctx.db.get(deal.accountId);
    const people = await Promise.all(
      deal.personIds.map((id) => ctx.db.get(id)),
    );
    return {
      me,
      deal: {
        title: deal.title,
        stage: DEAL_STAGE_LABEL[deal.stage],
        amount: formatMoney(deal.amount),
        closeDate: deal.closeDate ?? null,
        account: account?.name ?? null,
        people: people.flatMap((person) =>
          person && !person.archivedAt && !person.erasedAt
            ? [{ name: personName(person), title: person.title ?? null }]
            : [],
        ),
      },
      timeline: await recent(
        ctx.db
          .query("timeline")
          .withIndex("by_deal", (q) => q.eq("dealId", dealId))
          .order("desc")
          .take(TIMELINE),
      ),
    };
  },
});

/** Which of these leads were erased, so Today never sends them to the model. */
export const erasedLeads = memberQuery({
  args: { ids: v.array(v.id("leads")) },
  handler: async (ctx, { ids }) => {
    const erased: Id<"leads">[] = [];
    for (const id of ids.slice(0, 100)) {
      if ((await ctx.db.get(id))?.erasedAt) erased.push(id);
    }
    return erased;
  },
});

const vSubject = v.object({
  account: v.union(v.string(), v.null()),
  person: v.union(v.string(), v.null()),
  deal: v.union(v.string(), v.null()),
});

/** Maps names the model heard to records; ambiguous or unknown names come back in `missed`. */
export const resolveNames = memberQuery({
  args: {
    accountId: v.optional(v.id("accounts")),
    subjects: v.array(vSubject),
  },
  handler: async (ctx, { accountId, subjects }) => {
    const fixed = accountId ? await ctx.db.get(accountId) : null;
    const results = [];
    for (const subject of subjects) {
      const missed: string[] = [];
      let account: { _id: Id<"accounts">; name: string } | null = fixed
        ? { _id: fixed._id, name: fixed.name }
        : null;
      if (!account && subject.account) {
        account = pickByName(
          await findAccounts(ctx, subject.account, 5),
          subject.account,
          (item) => item.name,
        );
        if (!account) missed.push(subject.account);
      }
      const person = subject.person
        ? pickByName(
            await findPeople(ctx, subject.person, 5, account?._id),
            subject.person,
            personName,
          )
        : null;
      if (subject.person && !person) missed.push(subject.person);
      const found = subject.deal ? await findDeals(ctx, subject.deal, 5) : [];
      const deal = subject.deal
        ? pickByName(
            account
              ? found.filter((item) => item.account?._id === account._id)
              : found,
            subject.deal,
            (item) => item.title,
          )
        : null;
      if (subject.deal && !deal) missed.push(subject.deal);

      const owner = account ?? person?.account ?? deal?.account ?? null;
      results.push({
        accountId: owner?._id ?? null,
        personId: person?._id ?? null,
        dealId: deal?._id ?? null,
        subjectName: person
          ? personName(person)
          : (owner?.name ?? deal?.title ?? null),
        missed,
      });
    }
    return results;
  },
});

async function begin(ctx: ActionCtx): Promise<void> {
  if (!(await ctx.runQuery(api.ai.enabled, {}))) unavailable();
}

async function spend(ctx: ActionCtx): Promise<void> {
  await ctx.runMutation(internal.ai.consume, {});
}

export const generateBrief = action({
  args: { accountId: v.id("accounts") },
  handler: async (ctx, { accountId }): Promise<void> => {
    await begin(ctx);
    const [crm, platform, previous] = await Promise.all([
      ctx.runQuery(api.ai.accountContext, { accountId }),
      ctx.runQuery(api.account360.platform, { accountId }),
      ctx.runQuery(api.ai.cached, { kind: "brief", accountId }),
    ]);
    const context = {
      crm,
      platform: !platform.linked
        ? null
        : {
            health: {
              score: platform.health.score,
              band: platform.health.band,
              factors: platform.health.factors.map(
                (factor) => `${factor.label}: ${factor.detail}`,
              ),
              signals: platform.health.signals.map(
                (signal) => `${signal.label}: ${signal.detail}`,
              ),
            },
            wallet: platform.wallet.status,
            balance: platform.wallet.balance
              ? formatMoney(platform.wallet.balance)
              : null,
            deposits: {
              last30Days: formatMoney(platform.deposits.last30),
              last90Days: formatMoney(platform.deposits.last90),
            },
            campaigns: platform.campaigns.slice(0, 10).map((campaign) => ({
              title: campaign.title,
              status: campaign.status,
              pauseReason: campaign.pauseReason,
              enrolled: campaign.enrolled,
              max: campaign.max,
            })),
            reviewsWaiting: platform.reviews.count,
            disputes: platform.disputes,
            marketplaces: platform.listings.map(
              (listing) => `${listing.label}: ${listing.count} listings`,
            ),
            recentEvents: platform.events
              .slice(0, 10)
              .map((event) =>
                [istDay(event.occurredAt), event.title, event.detail]
                  .filter(Boolean)
                  .join(" · "),
              ),
          },
    };
    const hash = await contextHash(context);
    if (previous.hash === hash && Date.now() - previous.at < BRIEF_TTL) return;

    await spend(ctx);
    const out = await generate<BriefOut>({
      model: "main",
      system: BRIEF.system,
      input: `Today is ${todayLine(istToday())}.\n${wrapData(context)}`,
      schema: BRIEF.schema,
      maxOutputTokens: 2000,
    });
    const data = {
      summary: out.summary.trim(),
      nextStep: out.nextStep.trim(),
      risks: out.risks
        .map((risk) => risk.trim())
        .filter(Boolean)
        .slice(0, 3),
    };
    if (!data.summary || !data.nextStep) {
      fail("unavailable", "AI gave an answer we couldn't use. Try again.");
    }
    await ctx.runMutation(internal.ai.store, {
      kind: "brief",
      key: previous.key,
      hash,
      data,
    });
  },
});

export const refreshNextActions = action({
  args: {},
  handler: async (ctx): Promise<void> => {
    await begin(ctx);
    const today = istToday();
    const [waiting, stuck, deals, previous] = await Promise.all([
      ctx.runQuery(api.leads.waiting, {}),
      ctx.runQuery(api.activation.mine, {}),
      ctx.runQuery(api.deals.closing, { by: istToday(7) }),
      ctx.runQuery(api.ai.cached, { kind: "next" }),
    ]);
    const erased = new Set<string>(
      await ctx.runQuery(api.ai.erasedLeads, {
        ids: waiting.leads.map((lead) => lead._id),
      }),
    );

    const items = [
      ...waiting.leads
        .filter((lead) => !erased.has(lead._id))
        .slice(0, PER_KIND)
        .map((lead) => ({
          key: `leads:${lead._id}`,
          type: "new lead",
          name: lead.name,
          company: lead.companyName,
          kind: LEAD_KIND_LABEL[lead.kind],
          receivedOn: istDay(lead._creationTime),
          firstTouchOn: lead.firstTouchedAt
            ? istDay(lead.firstTouchedAt)
            : null,
          slaBreached: Boolean(lead.slaBreachedAt),
          demoOn: lead.demoAt ? istDay(lead.demoAt) : null,
        })),
      ...stuck.slice(0, PER_KIND).map((row) => ({
        key: `accounts:${row._id}`,
        type: "brand stuck in onboarding",
        account: row.account.name,
        stage: row.stage,
        problem: row.label,
        detail: row.title,
        playbook: row.playbook,
        stuckSince: istDay(row.since),
      })),
      ...deals.slice(0, PER_KIND).map((deal) => ({
        key: `deals:${deal._id}`,
        type: "deal closing soon",
        title: deal.title,
        account: deal.account?.name ?? null,
        stage: DEAL_STAGE_LABEL[deal.stage],
        amount: formatMoney(deal.amount),
        closeDate: deal.closeDate,
      })),
    ];
    if (items.length === 0) return;
    const hash = await contextHash(items);
    if (previous.hash === hash && Date.now() - previous.at < NEXT_TTL) return;

    await spend(ctx);
    const out = await generate<NextOut>({
      model: "fast",
      system: NEXT.system,
      input: `Today is ${todayLine(today)}.\n${wrapData(items)}`,
      schema: NEXT.schema,
      maxOutputTokens: 2000,
    });
    const allowed = new Set(items.map((item) => item.key));
    const data: Record<string, string> = {};
    for (const { key, text } of out.suggestions) {
      const line = truncate(text, 80);
      if (allowed.has(key) && line) data[key] = line;
    }
    await ctx.runMutation(internal.ai.store, {
      kind: "next",
      key: previous.key,
      hash,
      data,
    });
  },
});

/** Turns a line like "call Kesar Leaf tomorrow about the proposal" into proposed records. Writes nothing. */
export const parseCapture = action({
  args: { text: v.string(), accountId: v.optional(v.id("accounts")) },
  handler: async (ctx, { text, accountId }): Promise<Capture> => {
    await begin(ctx);
    const line = truncate(text, 1000);
    if (!line) invalid("text", "Type something first");
    await spend(ctx);
    const today = istToday();
    const out = await generate<CaptureOut>({
      model: "fast",
      system: CAPTURE.system,
      input: `Today is ${todayLine(today)}.\n${wrapData({ line })}`,
      schema: CAPTURE.schema,
      maxOutputTokens: 1500,
    });
    const parsed = out.items
      .filter((item) => item.text.trim())
      .slice(0, CAPTURE_ITEMS);
    const resolved = await ctx.runQuery(api.ai.resolveNames, {
      accountId,
      subjects: parsed.map(({ account, person, deal }) => ({
        account,
        person,
        deal,
      })),
    });

    const items = parsed.map((item, index): Capture["items"][number] => {
      const match = resolved[index];
      const subject = {
        accountId: match.accountId,
        personId: match.personId,
        dealId: match.dealId,
        subjectName: match.subjectName,
      };
      const body = item.text.trim();
      if (item.kind === "task") {
        return {
          kind: "task",
          title: truncate(body, 120),
          dueDate: dayOrNull(item.dueDate, today),
          ...subject,
        };
      }
      if (item.kind === "note") return { kind: "note", body, ...subject };
      return { kind: "call", summary: body, ...subject };
    });
    const missed = [...new Set(resolved.flatMap((item) => item.missed))];
    return { items, unresolved: missed.join(", ") || null };
  },
});

export const draft = action({
  args: {
    target: vTarget,
    channel: v.union(v.literal("whatsapp"), v.literal("email")),
    goal: v.optional(v.string()),
  },
  handler: async (ctx, { target, channel, goal }): Promise<Draft> => {
    await begin(ctx);
    const context = await ctx.runQuery(api.ai.targetContext, { target });
    await spend(ctx);
    const spec = channel === "email" ? EMAIL : WHATSAPP;
    const wanted = truncate(goal, 500);
    const out = await generate<DraftOut>({
      model: "main",
      system: spec.system,
      input: `Today is ${todayLine(istToday())}.${wanted ? `\nThe rep's goal for this message: ${wanted}` : ""}\n${wrapData(context)}`,
      schema: spec.schema,
      maxOutputTokens: 2000,
    });
    const body = out.body.trim();
    const subject = out.subject?.trim() || null;
    if (!body || (channel === "email" && !subject)) {
      fail("unavailable", "AI gave an answer we couldn't use. Try again.");
    }
    return { subject: channel === "email" ? subject : null, body };
  },
});

export const summarizeCall = action({
  args: { target: vTarget, notes: v.string() },
  handler: async (ctx, { target, notes }): Promise<CallSummary> => {
    await begin(ctx);
    const text = notes.trim().slice(0, NOTES_MAX);
    if (!text) invalid("notes", "Add the call notes first");
    const context = await ctx.runQuery(api.ai.targetContext, { target });
    await spend(ctx);
    const today = istToday();
    const out = await generate<CallOut>({
      model: "main",
      system: CALL.system,
      input: `Today is ${todayLine(today)}.\n${wrapData({ notes: text, record: context })}`,
      schema: CALL.schema,
      maxOutputTokens: 2000,
    });
    const summary = out.summary.trim();
    if (!summary) {
      fail("unavailable", "AI gave an answer we couldn't use. Try again.");
    }
    return {
      summary,
      actionItems: out.actionItems
        .filter((item) => item.title.trim())
        .slice(0, 8)
        .map((item) => ({
          title: truncate(item.title, 100),
          dueDate: dayOrNull(item.dueDate, today),
        })),
    };
  },
});
