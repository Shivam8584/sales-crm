import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { PRIORITIES, type DealStage } from "../../lib/domain/enums";
import { istToday } from "../../lib/domain/day";
import { personName } from "../../lib/domain/labels";
import { formatMoney } from "../../lib/domain/money";
import { clip, RECORD_TYPES, type TAGGABLE, type UndoOp } from "../../lib/domain/mcp";
import {
  describeNode,
  describeTrigger,
  stepOrder,
  type Graph,
  type Trigger,
} from "../../lib/domain/automations";
import {
  normalizeEmail,
  normalizePhone,
  cleanTags,
} from "../../lib/domain/normalize";
import { isDealClosed } from "../../lib/domain/transitions";
import * as account360 from "../account360";
import * as accounts from "../accounts";
import * as activation from "../activation";
import * as automations from "../automations";
import * as deals from "../deals";
import * as leads from "../leads";
import * as people from "../people";
import * as tasks from "../tasks";
import * as timeline from "../timeline";
import { fail, invalid, notFound } from "./errors";
import { findPerson } from "./identity";
import { isOpen } from "./leads";
import { logSystem } from "./timeline";
import { runAs, type ArgsOf, type ResultOf } from "./mcp";

type Input = Record<string, unknown>;
type Member = Doc<"members">;
type RecordType = (typeof RECORD_TYPES)[number];

const iso = (at: number | null | undefined) =>
  at ? new Date(at).toISOString() : null;

const ref = (row: { _id: string; name: string } | null | undefined) =>
  row ? { id: row._id, name: clip(row.name, 120) } : null;

const money = (amount: Doc<"deals">["amount"]) => formatMoney(amount);

function rank(a: { dueDate: string | null; priority: string }) {
  return `${a.dueDate ?? "9999-99-99"}${PRIORITIES.indexOf(a.priority as never)}`;
}

type TaskRow = ResultOf<typeof tasks.list>[number];

async function openTasks(
  ctx: QueryCtx,
  member: Member,
  filter: {
    assigneeId?: Id<"members">;
    accountId?: Id<"accounts">;
    personId?: Id<"people">;
  },
) {
  const rows = await runAs(tasks.list, ctx, member, {
    ...filter,
    done: "none",
  });
  return rows
    .filter((task) => task.status !== "done")
    .sort((a, b) => rank(a).localeCompare(rank(b)));
}

function taskLine(task: TaskRow) {
  return {
    id: task._id,
    title: clip(task.title, 200),
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    assignee: task.assignee?.name ?? null,
    account: ref(task.account),
    person: ref(task.person),
    deal: task.deal
      ? { id: task.deal._id, name: clip(task.deal.title, 120) }
      : null,
    lead: ref(task.lead),
  };
}

/** Latest entries on a record, minus anything about an erased person. */
async function recentTimeline(
  ctx: QueryCtx,
  member: Member,
  target:
    | { accountId: Id<"accounts"> }
    | { personId: Id<"people"> }
    | { dealId: Id<"deals"> }
    | { leadId: Id<"leads"> },
  limit: number,
) {
  const result = await runAs(timeline.page, ctx, member, {
    target,
    paginationOpts: { numItems: limit, cursor: null },
  });
  const erased = new Set<string>();
  for (const id of new Set(result.page.map((entry) => entry.personId))) {
    if (id && (await ctx.db.get(id))?.erasedAt) erased.add(id);
  }
  return result.page
    .filter((entry) => !entry.personId || !erased.has(entry.personId))
    .map((entry) => ({
      at: iso(entry.occurredAt),
      kind: entry.kind,
      by: entry.actor?.name ?? null,
      about: entry.person?.name ?? null,
      subject: clip(entry.subject),
      text: clip(entry.body),
    }));
}

async function liveAccount(ctx: QueryCtx, raw: string) {
  const id = ctx.db.normalizeId("accounts", raw);
  const account = id ? await ctx.db.get(id) : null;
  if (!account || account.archivedAt) notFound("Account");
  return account;
}

async function livePerson(ctx: QueryCtx, raw: string) {
  const id = ctx.db.normalizeId("people", raw);
  const person = id ? await ctx.db.get(id) : null;
  if (!person || person.archivedAt || person.erasedAt) notFound("Person");
  return person;
}

async function liveLead(ctx: QueryCtx, raw: string) {
  const id = ctx.db.normalizeId("leads", raw);
  const lead = id ? await ctx.db.get(id) : null;
  if (!lead) notFound("Lead");
  if (lead.erasedAt) fail("forbidden", "This lead's data was erased");
  return lead;
}

async function liveDeal(ctx: QueryCtx, raw: string) {
  const id = ctx.db.normalizeId("deals", raw);
  const deal = id ? await ctx.db.get(id) : null;
  if (!deal) notFound("Deal");
  return deal;
}

async function recordTarget(ctx: QueryCtx, type: RecordType, id: string) {
  switch (type) {
    case "account": {
      const row = await liveAccount(ctx, id);
      return { refs: { accountId: row._id }, name: row.name };
    }
    case "person": {
      const row = await livePerson(ctx, id);
      return { refs: { personId: row._id }, name: personName(row) };
    }
    case "lead": {
      const row = await liveLead(ctx, id);
      return { refs: { leadId: row._id }, name: row.name };
    }
    case "deal": {
      const row = await liveDeal(ctx, id);
      return { refs: { dealId: row._id }, name: row.title };
    }
  }
}

const OPEN_LIMIT = 10;
const TIMELINE_ACCOUNT = 15;
const TIMELINE_RECORD = 10;
const SUMMARY_ITEMS = 5;

type Tool<C> = (ctx: C, member: Member, input: Input) => Promise<unknown>;

export const READ: Record<string, Tool<QueryCtx>> = {
  async search_records(ctx, _member, input) {
    const query = String(input.query).trim();
    const types = new Set<string>((input.types as string[]) ?? RECORD_TYPES);
    const [found, who, pipeline, byDeal] = await Promise.all([
      types.has("account") ? accounts.findAccounts(ctx, query, 5) : [],
      types.has("person") ? people.findPeople(ctx, query, 5) : [],
      types.has("lead") ? leads.findLeads(ctx, query, 5) : [],
      types.has("deal") ? deals.findDeals(ctx, query, 5) : [],
    ]);
    const notErased = async <T extends { _id: Id<"leads"> | Id<"people"> }>(
      rows: T[],
    ) => {
      const kept: T[] = [];
      for (const row of rows) {
        if (!(await ctx.db.get(row._id))?.erasedAt) kept.push(row);
      }
      return kept;
    };
    const liveLeads = await notErased(pipeline);
    const livePeople = await notErased(who);
    return {
      accounts: found.map((a) => ({
        id: a._id,
        name: a.name,
        website: a.domain,
      })),
      people: livePeople.map((p) => ({
        id: p._id,
        name: personName(p),
        title: p.title,
        account: ref(p.account),
      })),
      leads: liveLeads.map((l) => ({
        id: l._id,
        name: l.name,
        company: l.companyName,
        status: l.status,
      })),
      deals: byDeal.map((d) => ({
        id: d._id,
        title: d.title,
        stage: d.stage,
        account: ref(d.account),
      })),
    };
  },

  async get_account(ctx, member, input) {
    const raw = await liveAccount(ctx, String(input.id));
    const account = (await runAs(accounts.get, ctx, member, { id: raw._id }))!;
    const accountId = raw._id;
    const [crew, accountDeals, work, platform, recent] = await Promise.all([
      runAs(people.list, ctx, member, { accountId }),
      runAs(deals.list, ctx, member, { accountId }),
      openTasks(ctx, member, { accountId }),
      runAs(account360.platform, ctx, member, { accountId }),
      recentTimeline(ctx, member, { accountId }, TIMELINE_ACCOUNT),
    ]);
    const statuses: Record<string, number> = {};
    if (platform.linked) {
      for (const campaign of platform.campaigns) {
        statuses[campaign.status] = (statuses[campaign.status] ?? 0) + 1;
      }
    }
    return {
      id: account._id,
      name: account.name,
      stage: account.stage,
      owner: account.owner?.name ?? null,
      tags: account.tags,
      website: account.domain,
      gstin: account.gstin,
      lastActivityAt: iso(account.lastActivityAt),
      platform: platform.linked
        ? {
            linked: true,
            health: {
              score: platform.health.score,
              band: platform.health.band,
              signals: platform.health.signals.map((signal) => signal.id),
            },
            wallet: platform.wallet.status,
            campaignsByStatus: statuses,
            lastEventAt: iso(platform.lastEventAt),
          }
        : { linked: false },
      people: crew
        .filter((person) => !person.erasedAt)
        .slice(0, 20)
        .map((person) => ({
          id: person._id,
          name: personName(person),
          title: person.title,
          email: person.email,
        })),
      openDeals: accountDeals
        .filter((deal) => !isDealClosed(deal.stage))
        .slice(0, OPEN_LIMIT)
        .map((deal) => ({
          id: deal._id,
          title: deal.title,
          stage: deal.stage,
          amount: money(deal.amount),
          closeDate: deal.closeDate,
        })),
      openTasks: work.slice(0, OPEN_LIMIT).map(taskLine),
      timeline: recent,
    };
  },

  async get_person(ctx, member, input) {
    const raw = await livePerson(ctx, String(input.id));
    const person = (await runAs(people.get, ctx, member, { id: raw._id }))!;
    const [work, recent] = await Promise.all([
      openTasks(ctx, member, { personId: raw._id }),
      recentTimeline(ctx, member, { personId: raw._id }, TIMELINE_RECORD),
    ]);
    return {
      id: person._id,
      name: personName(person),
      title: person.title,
      email: person.email,
      phone: person.phone,
      linkedin: person.linkedinUrl,
      tags: person.tags,
      account: ref(person.account),
      owner: person.owner?.name ?? null,
      lastActivityAt: iso(person.lastActivityAt),
      openTasks: work.slice(0, OPEN_LIMIT).map(taskLine),
      timeline: recent,
    };
  },

  async get_lead(ctx, member, input) {
    const raw = await liveLead(ctx, String(input.id));
    const lead = (await runAs(leads.get, ctx, member, { id: raw._id }))!;
    return {
      id: lead._id,
      name: lead.name,
      company: lead.companyName,
      email: lead.email ?? null,
      phone: lead.phone ?? null,
      website: lead.website ?? null,
      status: lead.status,
      kind: lead.kind,
      source: lead.source,
      score: lead.score ?? null,
      owner: lead.owner?.name ?? null,
      createdAt: iso(lead._creationTime),
      firstTouchedAt: iso(lead.firstTouchedAt),
      slaBreachedAt: iso(lead.slaBreachedAt),
      message: clip(lead.message),
      account: ref(lead.account),
      person: ref(lead.person),
      timeline: await recentTimeline(
        ctx,
        member,
        { leadId: raw._id },
        TIMELINE_RECORD,
      ),
    };
  },

  async get_deal(ctx, member, input) {
    const raw = await liveDeal(ctx, String(input.id));
    const deal = (await runAs(deals.get, ctx, member, { id: raw._id }))!;
    const contacts = [];
    for (const id of deal.personIds.slice(0, OPEN_LIMIT)) {
      const person = await ctx.db.get(id);
      if (person && !person.archivedAt && !person.erasedAt) {
        contacts.push({ id: person._id, name: personName(person) });
      }
    }
    return {
      id: deal._id,
      title: deal.title,
      stage: deal.stage,
      amount: money(deal.amount),
      closeDate: deal.closeDate,
      closedAt: iso(deal.closedAt),
      lostReason: clip(deal.lostReason),
      owner: deal.owner?.name ?? null,
      account: ref(deal.account),
      people: contacts,
      timeline: await recentTimeline(
        ctx,
        member,
        { dealId: raw._id },
        TIMELINE_RECORD,
      ),
    };
  },

  async list_my_tasks(ctx, member, input) {
    const today = istToday();
    const when = (input.when as string | undefined) ?? "all";
    const limit = (input.limit as number | undefined) ?? 20;
    const mine = await openTasks(ctx, member, { assigneeId: member._id });
    const due = (task: TaskRow) => task.dueDate;
    const chosen = mine.filter((task) =>
      when === "overdue"
        ? due(task) && due(task)! < today
        : when === "today"
          ? due(task) === today
          : when === "upcoming"
            ? due(task) && due(task)! > today
            : true,
    );
    return {
      today,
      total: chosen.length,
      tasks: chosen.slice(0, limit).map(taskLine),
    };
  },

  async todays_summary(ctx, member) {
    const today = istToday();
    const week = istToday(7);
    const [mine, waiting, stuck, closing] = await Promise.all([
      openTasks(ctx, member, { assigneeId: member._id }),
      runAs(leads.waiting, ctx, member, {}),
      runAs(activation.mine, ctx, member, {}),
      runAs(deals.closing, ctx, member, { by: week }),
    ]);
    const stallTasks = new Set(
      stuck.flatMap((row) => (row.task ? [row.task._id] : [])),
    );
    const plain = mine.filter((task) => !stallTasks.has(task._id));
    const section = <T, U>(rows: T[], line: (row: T) => U) => ({
      count: rows.length,
      items: rows.slice(0, SUMMARY_ITEMS).map(line),
    });
    return {
      date: today,
      leadsWaiting: {
        ...section(waiting.leads, (lead) => ({
          id: lead._id,
          name: lead.name,
          company: lead.companyName,
          slaBreached: Boolean(lead.slaBreachedAt),
        })),
        breached: waiting.leads.filter((lead) => lead.slaBreachedAt).length,
      },
      overdue: section(
        plain.filter((task) => task.dueDate && task.dueDate < today),
        taskLine,
      ),
      dueToday: section(
        plain.filter((task) => task.dueDate === today),
        taskLine,
      ),
      upcoming: section(
        plain.filter(
          (task) =>
            task.dueDate && task.dueDate > today && task.dueDate <= week,
        ),
        taskLine,
      ),
      stuckBrands: section(stuck, (row) => ({
        id: row._id,
        name: row.account.name,
        problem: clip(row.title, 160),
        since: iso(row.since),
      })),
      dealsClosingThisWeek: section(closing, (deal) => ({
        id: deal._id,
        title: deal.title,
        stage: deal.stage,
        amount: money(deal.amount),
        closeDate: deal.closeDate,
        account: ref(deal.account),
      })),
    };
  },

  async list_sequences(ctx, member) {
    const rows = await runAs(automations.list, ctx, member, {});
    return rows.slice(0, 50).map((row) => ({
      id: row._id,
      name: clip(row.name, 120),
      status: row.status,
      runsOn: row.subjectKind,
      trigger: clip(row.trigger, 160),
      steps: row.steps.length,
      stats: row.stats,
      mine: row.mine,
    }));
  },

  async get_sequence(ctx, member, input) {
    const id = ctx.db.normalizeId("automations", String(input.id));
    const sequence = id
      ? await runAs(automations.get, ctx, member, { id })
      : null;
    if (!sequence) notFound("Sequence");
    const graph = sequence.graph as Graph;
    const trigger = sequence.trigger as Trigger;
    const order = stepOrder(graph);
    const nodes = order.flatMap((nodeId) => {
      const node = graph.nodes.find((item) => item.id === nodeId);
      return node ? [node] : [];
    });
    return {
      id: sequence._id,
      name: clip(sequence.name, 120),
      description: clip(sequence.description),
      status: sequence.status,
      runsOn: sequence.subjectKind,
      trigger: clip(describeTrigger(trigger), 160),
      unpublishedChanges: sequence.hasChanges,
      steps: nodes.map((node, index) => ({
        step: index + 1,
        kind: node.kind,
        title: clip(node.title?.trim() || describeNode(node, trigger), 160),
        next: graph.edges
          .filter((edge) => edge.source === node.id)
          .flatMap((edge) => {
            const to = order.indexOf(edge.target);
            return to < 0 ? [] : [{ when: edge.port, step: to + 1 }];
          }),
      })),
    };
  },

  async read_sequence_log(ctx, member, input) {
    const id = ctx.db.normalizeId("automations", String(input.id));
    const sequence = id ? await ctx.db.get(id) : null;
    if (!id || !sequence || sequence.deletedAt) notFound("Sequence");
    const limit = (input.limit as number | undefined) ?? 20;
    const rows = await runAs(automations.logs, ctx, member, { id });
    return rows.slice(0, limit).map((row) => ({
      at: iso(row.at),
      level: row.level,
      message: clip(row.message),
      step: row.nodeId,
      subject: {
        type: row.subject.kind,
        id: row.subject.id,
        name: clip(row.subject.name, 120),
      },
    }));
  },
};

/** What a write tool did, and how a person can take it back. */
export type Undo = {
  op: UndoOp;
  id: string;
  patch?: Record<string, unknown>;
  /** Fields that must still hold the value the tool set, or the undo would overwrite newer work. */
  expect?: Record<string, unknown>;
};

type Done = { result: object; summary: string; undo?: Undo };
type WriteTool = (
  ctx: MutationCtx,
  member: Member,
  input: Input,
) => Promise<Done>;

const optionalText = (value: unknown) =>
  value === undefined ? undefined : String(value);

async function openLeadFor(
  ctx: QueryCtx,
  email: string | undefined,
  phone: string | undefined,
) {
  const rows = [
    ...(email
      ? await ctx.db
          .query("leads")
          .withIndex("by_email", (q) => q.eq("email", email))
          .take(20)
      : []),
    ...(phone
      ? await ctx.db
          .query("leads")
          .withIndex("by_phone", (q) => q.eq("phone", phone))
          .take(20)
      : []),
  ];
  return rows.find((lead) => isOpen(lead) && !lead.erasedAt) ?? null;
}

export const WRITE: Record<string, WriteTool> = {
  async create_task(ctx, member, input) {
    const links = (
      ["accountId", "personId", "leadId", "dealId"] as const
    ).filter((key) => input[key] !== undefined);
    if (links.length > 1)
      invalid(links[1], "Link a task to one record at most");
    const args: ArgsOf<typeof tasks.create> = {
      title: String(input.title).trim(),
      dueDate: optionalText(input.dueDate),
      priority: input.priority as never,
    };
    const raw = links[0] ? String(input[links[0]]) : null;
    if (links[0] === "accountId")
      args.accountId = (await liveAccount(ctx, raw!))._id;
    if (links[0] === "personId")
      args.personId = (await livePerson(ctx, raw!))._id;
    if (links[0] === "leadId") args.leadId = (await liveLead(ctx, raw!))._id;
    if (links[0] === "dealId") args.dealId = (await liveDeal(ctx, raw!))._id;
    const id = await runAs(tasks.create, ctx, member, args);
    return {
      result: {
        id,
        title: args.title,
        dueDate: args.dueDate ?? null,
        priority: args.priority ?? "normal",
      },
      summary: `Added the task “${clip(args.title, 80)}”`,
      undo: { op: "remove_task", id },
    };
  },

  async complete_task(ctx, member, input) {
    const id = ctx.db.normalizeId("tasks", String(input.id));
    const task = id ? await ctx.db.get(id) : null;
    if (!id || !task) notFound("Task");
    if (task.status === "done") {
      return {
        result: { id, alreadyDone: true },
        summary: "Task was already done",
      };
    }
    const before = await runAs(tasks.update, ctx, member, {
      id,
      patch: { status: "done" },
    });
    return {
      result: { id, title: task.title, status: "done" },
      summary: `Completed the task “${clip(task.title, 80)}”`,
      undo: {
        op: "update_task",
        id,
        patch: { status: before.status },
        expect: { status: "done" },
      },
    };
  },

  async create_note(ctx, member, input) {
    const { type, id } = input.target as { type: RecordType; id: string };
    const { refs, name } = await recordTarget(ctx, type, id);
    const logged = await runAs(timeline.log, ctx, member, {
      target: refs,
      kind: "note",
      body: String(input.body).trim(),
    });
    return {
      result: { id: logged.id },
      summary: `Added a note on ${clip(name, 80)}`,
      undo: { op: "remove_entry", id: logged.id },
    };
  },

  async log_call(ctx, member, input) {
    const { type, id } = input.target as { type: RecordType; id: string };
    const { refs, name } = await recordTarget(ctx, type, id);
    const logged = await runAs(timeline.log, ctx, member, {
      target: refs,
      kind: "call",
      outcome: input.outcome as never,
      durationMin: input.durationMin as number | undefined,
      body: optionalText(input.body)?.trim(),
    });
    return {
      result: { id: logged.id },
      summary: `Logged a call on ${clip(name, 80)}`,
      undo: { op: "remove_entry", id: logged.id },
    };
  },

  async create_lead(ctx, member, input) {
    const email = optionalText(input.email);
    const phone = optionalText(input.phone);
    const person = await findPerson(ctx, { email, phone });
    if (person) {
      fail(
        "conflict",
        `${personName(person)} is already a person in the CRM (id ${person._id}). Use that record instead.`,
      );
    }
    const open = await openLeadFor(
      ctx,
      email && (normalizeEmail(email) ?? undefined),
      phone && (normalizePhone(phone) ?? undefined),
    );
    if (open) {
      fail(
        "conflict",
        `${open.name} already has an open lead (id ${open._id}). Use that record instead.`,
      );
    }
    const id = await runAs(leads.create, ctx, member, {
      name: String(input.name),
      companyName: String(input.companyName),
      email,
      phone,
      website: optionalText(input.website),
      message: optionalText(input.message),
    });
    await logSystem(
      ctx,
      { leadId: id },
      "added the lead",
      undefined,
      member._id,
    );
    return {
      result: { id, name: String(input.name).trim() },
      summary: `Added the lead ${clip(String(input.name), 80)}`,
    };
  },

  async update_deal_stage(ctx, member, input) {
    const deal = await liveDeal(ctx, String(input.id));
    const stage = input.stage as DealStage;
    if (deal.stage === stage) {
      return {
        result: { id: deal._id, stage, unchanged: true },
        summary: `Deal ${clip(deal.title, 80)} was already ${stage}`,
      };
    }
    const before = await runAs(deals.update, ctx, member, {
      id: deal._id,
      patch: { stage, lostReason: optionalText(input.lostReason) },
    });
    return {
      result: { id: deal._id, stage },
      summary: `Moved ${clip(deal.title, 80)} to ${stage}`,
      undo: {
        op: "update_deal",
        id: deal._id,
        patch: { stage: before.stage, lostReason: before.lostReason },
        expect: { stage },
      },
    };
  },

  async add_tag(ctx, member, input) {
    const { type, id } = input.target as {
      type: (typeof TAGGABLE)[number];
      id: string;
    };
    const [tag] = cleanTags([String(input.tag)]);
    if (!tag) invalid("tag", "Enter a tag");
    const row =
      type === "account"
        ? await liveAccount(ctx, id)
        : await livePerson(ctx, id);
    const name = "firstName" in row ? personName(row) : row.name;
    if (row.tags.some((item) => item.toLowerCase() === tag.toLowerCase())) {
      return {
        result: { id: row._id, tags: row.tags, unchanged: true },
        summary: `${clip(name, 80)} already has the tag ${tag}`,
      };
    }
    const tags = cleanTags([...row.tags, tag]);
    if (!tags.includes(tag))
      invalid("tag", "This record has the most tags allowed");
    const patch = { tags };
    const before =
      "firstName" in row
        ? await runAs(people.update, ctx, member, {
            id: row._id as Id<"people">,
            patch,
          })
        : await runAs(accounts.update, ctx, member, {
            id: row._id as Id<"accounts">,
            patch,
          });
    return {
      result: { id: row._id, tags },
      summary: `Tagged ${clip(name, 80)} ${tag}`,
      undo: {
        op: type === "account" ? "update_account" : "update_person",
        id: row._id,
        patch: { tags: before.tags },
        expect: { tags },
      },
    };
  },
};

/** Takes a write back through the same app mutation a person would use. */
export async function runUndo(ctx: MutationCtx, member: Member, undo: Undo) {
  const table = {
    remove_task: "tasks",
    update_task: "tasks",
    remove_entry: "timeline",
    update_deal: "deals",
    update_account: "accounts",
    update_person: "people",
  } as const;
  const id = ctx.db.normalizeId(table[undo.op], undo.id);
  const doc = id ? await ctx.db.get(id) : null;
  if (!id || !doc) notFound("Record");
  for (const [field, value] of Object.entries(undo.expect ?? {})) {
    if (
      JSON.stringify((doc as Record<string, unknown>)[field]) !==
      JSON.stringify(value)
    ) {
      fail("conflict", "That changed since, so it can't be undone safely");
    }
  }
  const patch = undo.patch as never;
  switch (undo.op) {
    case "remove_task":
      await runAs(tasks.remove, ctx, member, { id: id as Id<"tasks"> });
      break;
    case "remove_entry":
      await runAs(timeline.remove, ctx, member, { id: id as Id<"timeline"> });
      break;
    case "update_task":
      await runAs(tasks.update, ctx, member, { id: id as Id<"tasks">, patch });
      break;
    case "update_deal":
      await runAs(deals.update, ctx, member, { id: id as Id<"deals">, patch });
      break;
    case "update_account":
      await runAs(accounts.update, ctx, member, {
        id: id as Id<"accounts">,
        patch,
      });
      break;
    case "update_person":
      await runAs(people.update, ctx, member, {
        id: id as Id<"people">,
        patch,
      });
      break;
  }
}
