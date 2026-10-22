import { v } from "convex/values";
import { findAccounts } from "./accounts";
import { findDeals } from "./deals";
import { findLeads } from "./leads";
import { countAccounts, countLeads } from "./lib/counts";
import { memberQuery } from "./lib/functions";
import { literals, vDay } from "./lib/validators";
import { findPeople } from "./people";
import { personName } from "../lib/domain/labels";

const CAP = 100;
const OPEN_TASK_STATUSES = ["todo", "in_progress"] as const;
const RESULTS_PER_TYPE = 5;
const RECENT_LIMIT = 8;

/** Sidebar counts: live accounts, new leads, my overdue tasks, my unread notifications. */
export const navCounts = memberQuery({
  args: { today: vDay },
  handler: async (ctx, { today }) => {
    const me = ctx.viewer._id;
    const [accounts, leads, overdue, unread] = await Promise.all([
      countAccounts(ctx, { archived: false }),
      countLeads(ctx, ["new"], {}),
      Promise.all(
        OPEN_TASK_STATUSES.map((status) =>
          ctx.db
            .query("tasks")
            .withIndex("by_assignee_status_due", (q) =>
              q
                .eq("assigneeId", me)
                .eq("status", status)
                .gt("dueDate", "")
                .lt("dueDate", today),
            )
            .take(CAP),
        ),
      ),
      ctx.db
        .query("notifications")
        .withIndex("by_recipient", (q) =>
          q.eq("recipientId", me).eq("readAt", undefined),
        )
        .take(CAP),
    ]);
    return {
      accounts,
      leads: leads.new,
      tasks: Math.min(
        CAP,
        overdue.reduce((sum, tasks) => sum + tasks.length, 0),
      ),
      inbox: unread.length,
    };
  },
});

/** ⌘K record search: the best few accounts, people, leads and deals. */
export const search = memberQuery({
  args: { search: v.string() },
  handler: async (ctx, { search }) => {
    if (!search.trim()) return null;
    const [accounts, people, leads, deals] = await Promise.all([
      findAccounts(ctx, search, RESULTS_PER_TYPE),
      findPeople(ctx, search, RESULTS_PER_TYPE),
      findLeads(ctx, search, RESULTS_PER_TYPE),
      findDeals(ctx, search, RESULTS_PER_TYPE),
    ]);
    return { accounts, people, leads, deals };
  },
});

const vRecordType = literals(["account", "person", "lead", "deal"]);

/** Names for the records the viewer opened recently, most recent first; gone ones are dropped. */
export const recent = memberQuery({
  args: {
    refs: v.array(v.object({ type: vRecordType, id: v.string() })),
  },
  handler: async (ctx, { refs }) => {
    const items = await Promise.all(
      refs.slice(0, RECENT_LIMIT).map(async ({ type, id }) => {
        if (type === "account") {
          const accountId = ctx.db.normalizeId("accounts", id);
          const account = accountId ? await ctx.db.get(accountId) : null;
          return account && !account.archivedAt
            ? {
                type,
                id,
                title: account.name,
                hint: account.domain ?? null,
                account: {
                  name: account.name,
                  domain: account.domain ?? null,
                  logoUrl: account.logoUrl ?? null,
                },
              }
            : null;
        }
        if (type === "person") {
          const personId = ctx.db.normalizeId("people", id);
          const person = personId ? await ctx.db.get(personId) : null;
          return person && !person.archivedAt && !person.erasedAt
            ? {
                type,
                id,
                title: personName(person),
                hint: person.title ?? null,
                account: null,
              }
            : null;
        }
        if (type === "lead") {
          const leadId = ctx.db.normalizeId("leads", id);
          const lead = leadId ? await ctx.db.get(leadId) : null;
          return lead && !lead.erasedAt
            ? {
                type,
                id,
                title: lead.name,
                hint: lead.companyName,
                account: null,
              }
            : null;
        }
        const dealId = ctx.db.normalizeId("deals", id);
        const deal = dealId ? await ctx.db.get(dealId) : null;
        const account = deal ? await ctx.db.get(deal.accountId) : null;
        return deal
          ? {
              type,
              id,
              title: deal.title,
              hint: account?.name ?? null,
              account: null,
            }
          : null;
      }),
    );
    return items.filter((item) => item !== null);
  },
});
