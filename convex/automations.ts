import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import {
  internalAction,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  DEFAULT_SETTINGS,
  LIMITS,
  SUBJECT_LABEL,
  TRIGGER_SUBJECTS,
  VARIABLES,
  configOf,
  EXIT_KIND_LABEL,
  FREQUENCY_CAP,
  LANGUAGES,
  TRIGGER_LABEL,
  isValidFrequencyCap,
  checkGraphShape,
  checkSender,
  describeNode,
  nodeFunnel,
  percent,
  renderTemplate,
  stepOrder,
  describeTrigger,
  isLive,
  simulate,
  subjectKey,
  validateAutomation,
  type AutomationDraft,
  type AutomationSettings,
  type Graph,
  type NameLookup,
  type ValidationContext,
} from "../lib/domain/automations";
import { STALL_RULES } from "./lib/activation";
import { notify } from "./notifications";
import {
  enroll,
  finish,
  logStep,
  pauseRun,
  resumeAllHeld,
  resumeHeld,
  resumeRun,
  runStep,
  stepFailed,
  subjectOf,
} from "./lib/automations/engine";
import {
  SAFETY_KEYS,
  killSwitchOn,
  readSafety,
  write as writeSetting,
} from "./lib/automations/safety";
import {
  deliver as deliverMessage,
  emailProvider,
  renderEmail,
  repliesTracked,
  whatsappProvider,
} from "./lib/automations/delivery";
import {
  loadSubject,
  recipientFor,
  subjectFacts,
  subjectVars,
  type SubjectRef,
} from "./lib/automations/subject";
import { TEMPLATE, TEMPLATES, templateIn } from "./lib/automations/templates";
import {
  vGraph,
  vLanguage,
  vSettings,
  vSubjectKind,
  vTrigger,
} from "./lib/automations/validators";
import { fail, invalid, notFound } from "./lib/errors";
import { rateLimiter } from "./lib/rateLimiter";
import {
  adminMutation,
  internalMutation,
  managerMutation,
  memberMutation,
  memberQuery,
} from "./lib/functions";
import { assertCan, can } from "./lib/permissions";
import { memberIndex } from "./lib/records";

const MAX_ENROLLMENTS_SCAN = 5000;
const LOG_PAGE = 100;
const DELIVERY_ATTEMPTS = 4;
const DELIVERY_RETRY_MS = 60_000;

const vTarget = v.object({ kind: vSubjectKind, id: v.string() });

async function requireAutomation(ctx: QueryCtx, id: Id<"automations">) {
  const automation = await ctx.db.get(id);
  if (!automation || automation.deletedAt) notFound("Automation");
  return automation;
}

const draftOf = (automation: Doc<"automations">): AutomationDraft => ({
  subjectKind: automation.subjectKind,
  trigger: automation.trigger,
  graph: automation.graph as Graph,
  settings: automation.settings,
});

const publishable = (automation: Doc<"automations">) => ({
  subjectKind: automation.subjectKind,
  trigger: automation.trigger,
  graph: automation.graph,
  settings: automation.settings,
});

/** The sender is edited on its own and applies at once, so a settings save never carries it. */
function withSender(
  settings: AutomationSettings,
  { senderName, replyTo }: { senderName?: string; replyTo?: string },
): AutomationSettings {
  const rest = { ...settings };
  delete rest.senderName;
  delete rest.replyTo;
  return {
    ...rest,
    ...(senderName && { senderName }),
    ...(replyTo && { replyTo }),
  };
}

function hasChanges(automation: Doc<"automations">) {
  const published = automation.published;
  if (!published) return true;
  return (
    JSON.stringify(publishable(automation)) !==
    JSON.stringify({
      subjectKind: published.subjectKind,
      trigger: published.trigger,
      graph: published.graph,
      settings: published.settings,
    })
  );
}

async function validationContext(
  ctx: QueryCtx,
  selfId?: Id<"automations">,
): Promise<ValidationContext> {
  const members = await ctx.db
    .query("members")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  const automations = (await ctx.db.query("automations").collect()).filter(
    (item) => !item.deletedAt,
  );
  return {
    memberIds: members.map((member) => member._id),
    automationIds: automations.map((item) => item._id),
    ruleIds: STALL_RULES.map((rule) => rule.id),
    selfId,
  };
}

async function nameLookup(ctx: QueryCtx): Promise<NameLookup> {
  const members = await memberIndex(ctx);
  const automations = await ctx.db.query("automations").collect();
  const byId = new Map(
    automations.map((item) => [item._id as string, item.name]),
  );
  const rules = new Map(
    STALL_RULES.map((rule) => [rule.id as string, rule.label]),
  );
  return {
    member: (id) => members.get(id as Id<"members">)?.name,
    automation: (id) => byId.get(id),
    rule: (id) => rules.get(id),
  };
}

function stepKinds(graph: Graph) {
  return [...graph.nodes]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((node) => node.kind);
}

/** Why this can't go live yet, or null. */
function blockedReason(graph: Graph) {
  const kinds = new Set(graph.nodes.map((node) => node.kind));
  if (kinds.has("send_email") && emailProvider().provider === "outbox") {
    return "Email sending isn't set up yet. Ask an admin to connect an email provider in the server settings.";
  }
  if (kinds.has("send_whatsapp") && whatsappProvider().provider === "outbox") {
    return "WhatsApp sending isn't set up yet. Ask an admin to connect WhatsApp in the server settings.";
  }
  return null;
}

type Viewed = MutationCtx & { viewer: Doc<"members"> };

/** Reps run only what they created; managers run anything. */
function assertOwnSequence(ctx: Viewed, automation: Doc<"automations">) {
  assertCan(ctx.viewer, "sequence.run", [automation.createdById]);
}

/** Reps enrol and remove only records they own. */
async function ownsRecord(ctx: Viewed, ref: SubjectRef) {
  if (can(ctx.viewer, "sequence.run")) return true;
  const subject = await loadSubject(ctx, ref);
  return can(ctx.viewer, "sequence.run", [subject?.ownerId]);
}

async function assertOwnsRecord(ctx: Viewed, ref: SubjectRef) {
  if (!(await ownsRecord(ctx, ref))) {
    fail("forbidden", "Only the record's owner or a manager can do that");
  }
}

// ── Queries ─────────────────────────────────────────────────────────────────

export const list = memberQuery({
  args: {},
  handler: async (ctx) => {
    const automations = (await ctx.db.query("automations").collect()).filter(
      (item) => !item.deletedAt,
    );
    const members = await memberIndex(ctx);
    const names = await nameLookup(ctx);
    return automations
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((automation) => ({
        _id: automation._id,
        _creationTime: automation._creationTime,
        name: automation.name,
        description: automation.description,
        status: automation.status,
        subjectKind: automation.subjectKind,
        trigger: describeTrigger(automation.trigger, names),
        steps: stepKinds(automation.graph as Graph),
        stats: automation.stats,
        version: automation.version,
        hasChanges: automation.status === "active" && hasChanges(automation),
        createdBy: members.get(automation.createdById)?.name ?? null,
        mine: automation.createdById === ctx.viewer._id,
        updatedAt: automation.updatedAt,
      }));
  },
});

export const get = memberQuery({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await ctx.db.get(id);
    if (!automation || automation.deletedAt) return null;
    const issues = validateAutomation(
      draftOf(automation),
      await validationContext(ctx, id),
    );
    return {
      _id: automation._id,
      name: automation.name,
      description: automation.description,
      status: automation.status,
      subjectKind: automation.subjectKind,
      trigger: automation.trigger,
      graph: automation.graph as Graph,
      settings: automation.settings,
      replyTracked: repliesTracked(automation.settings.replyTo),
      version: automation.version,
      publishedAt: automation.published?.publishedAt ?? null,
      hasChanges: hasChanges(automation),
      stats: automation.stats,
      updatedAt: automation.updatedAt,
      issues,
      blocked: blockedReason(automation.graph as Graph),
      mine: automation.createdById === ctx.viewer._id,
    };
  },
});

/** Choices the editor needs: teammates, other automations, stall rules, templates and delivery status. */
export const catalog = memberQuery({
  args: {},
  handler: async (ctx) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    const automations = (await ctx.db.query("automations").collect()).filter(
      (item) => !item.deletedAt,
    );
    return {
      members: members
        .map((member) => ({ _id: member._id, name: member.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      automations: automations.map((item) => ({
        _id: item._id,
        name: item.name,
        status: item.status,
        subjectKind: item.subjectKind,
      })),
      stallRules: STALL_RULES.map((rule) => ({
        id: rule.id as string,
        label: rule.label,
        description: rule.description,
      })),
      templates: TEMPLATES.map((template) => ({
        key: template.key,
        name: template.name,
        subjectKind: template.subjectKind,
        trigger: describeTrigger(template.trigger),
        copies: LANGUAGES.filter(
          (language) => language === "en" || template.variants[language],
        ).map((language) => {
          const copy = templateIn(template, language);
          return {
            language,
            description: copy.description,
            steps: stepKinds(copy.graph),
          };
        }),
      })),
      providers: { email: emailProvider(), whatsapp: whatsappProvider() },
    };
  },
});

/** Per step: how many runs reached it, went on, are on it now, and which path they took. */
export const nodeStats = memberQuery({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const enrollments = await ctx.db
      .query("automationEnrollments")
      .withIndex("by_automation", (q) => q.eq("automationId", id))
      .order("desc")
      .take(MAX_ENROLLMENTS_SCAN);
    return nodeFunnel(enrollments);
  },
});

async function subjectName(
  ctx: QueryCtx,
  enrollment: Doc<"automationEnrollments">,
) {
  const subject = await loadSubject(ctx, {
    kind: enrollment.subjectKind,
    id: enrollment.subjectKey.split(":")[1],
  });
  return subject
    ? {
        kind: subject.kind,
        id: subject.id,
        name: subject.name,
        href: subject.href,
      }
    : {
        kind: enrollment.subjectKind,
        id: "",
        name: "Deleted record",
        href: null,
      };
}

export const logs = memberQuery({
  args: { id: v.id("automations"), nodeId: v.optional(v.string()) },
  handler: async (ctx, { id, nodeId }) => {
    const rows = nodeId
      ? await ctx.db
          .query("automationSteps")
          .withIndex("by_automation_node", (q) =>
            q.eq("automationId", id).eq("nodeId", nodeId),
          )
          .order("desc")
          .take(LOG_PAGE)
      : await ctx.db
          .query("automationSteps")
          .withIndex("by_automation", (q) => q.eq("automationId", id))
          .order("desc")
          .take(LOG_PAGE);
    const subjects = new Map<string, Awaited<ReturnType<typeof subjectName>>>();
    const out = [];
    for (const row of rows) {
      if (!subjects.has(row.enrollmentId)) {
        const enrollment = await ctx.db.get(row.enrollmentId);
        subjects.set(
          row.enrollmentId,
          enrollment
            ? await subjectName(ctx, enrollment)
            : { kind: "lead", id: "", name: "Removed run", href: null },
        );
      }
      out.push({
        _id: row._id,
        at: row.at,
        level: row.level,
        message: row.message,
        nodeId: row.nodeId ?? null,
        subject: subjects.get(row.enrollmentId)!,
      });
    }
    return out;
  },
});

/** One page of an automation's runs, newest first. */
export const enrollments = memberQuery({
  args: { id: v.id("automations"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { id, paginationOpts }) => {
    const result = await ctx.db
      .query("automationEnrollments")
      .withIndex("by_automation_time", (q) => q.eq("automationId", id))
      .order("desc")
      .paginate(paginationOpts);
    const out = [];
    for (const row of result.page) {
      out.push({
        _id: row._id,
        status: row.status,
        currentNodeId: row.currentNodeId,
        nextRunAt: row.nextRunAt ?? null,
        enrolledAt: row.enrolledAt,
        finishedAt: row.finishedAt ?? null,
        exitReason: row.exitReason ?? null,
        held: Boolean(row.heldAt) && !row.pausedById,
        paused: Boolean(row.pausedById),
        replied: Boolean(row.repliedAt),
        subject: await subjectName(ctx, row),
      });
    }
    return { ...result, page: out };
  },
});

/** A record's runs, newest first, and the automations it can be enrolled in by hand. */
export const forRecord = memberQuery({
  args: { target: vTarget },
  handler: async (ctx, { target }) => {
    const key = subjectKey(target.kind, target.id);
    const rows = [];
    for (const status of [
      "running",
      "waiting",
      "completed",
      "exited",
      "failed",
    ] as const) {
      rows.push(
        ...(await ctx.db
          .query("automationEnrollments")
          .withIndex("by_subject", (q) =>
            q.eq("subjectKey", key).eq("status", status),
          )
          .collect()),
      );
    }
    const names = await nameLookup(ctx);
    const automations = new Map<string, Doc<"automations"> | null>();
    const runs = [];
    for (const row of rows.sort((a, b) => b.enrolledAt - a.enrolledAt)) {
      if (!automations.has(row.automationId)) {
        automations.set(row.automationId, await ctx.db.get(row.automationId));
      }
      const automation = automations.get(row.automationId);
      const graph = (automation?.published?.graph ?? automation?.graph) as
        | Graph
        | undefined;
      const node = graph?.nodes.find((item) => item.id === row.currentNodeId);
      runs.push({
        _id: row._id,
        automationId: row.automationId,
        automation:
          automation && !automation.deletedAt
            ? automation.name
            : "Deleted automation",
        status: row.status,
        held: Boolean(row.heldAt) && !row.pausedById,
        paused: Boolean(row.pausedById),
        step:
          node && automation
            ? describeNode(
                node,
                automation.published?.trigger ?? automation.trigger,
                names,
              )
            : null,
        nextRunAt: row.nextRunAt ?? null,
        enrolledAt: row.enrolledAt,
        finishedAt: row.finishedAt ?? null,
        exitReason: row.exitReason ?? null,
        source: row.source,
      });
    }
    const live = new Set(
      runs.filter((run) => isLive(run.status)).map((run) => run.automationId),
    );
    const available = (
      await ctx.db
        .query("automations")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .collect()
    )
      .filter(
        (item) =>
          !item.deletedAt &&
          item.published?.subjectKind === target.kind &&
          !live.has(item._id),
      )
      .map((item) => ({ _id: item._id, name: item.name }));
    return { runs, available };
  },
});

const SUBJECT_LIMIT = 30;

/** Records to try an automation on, for the test-run picker. */
export const subjects = memberQuery({
  args: { kind: vSubjectKind, query: v.optional(v.string()) },
  handler: async (ctx, { kind, query }) => {
    const text = query?.trim().toLowerCase() ?? "";
    const matches = (value: string) =>
      !text || value.toLowerCase().includes(text);
    if (kind === "account") {
      const rows = text
        ? await ctx.db
            .query("accounts")
            .withSearchIndex("search_name", (q) => q.search("name", text))
            .take(SUBJECT_LIMIT)
        : await ctx.db
            .query("accounts")
            .withIndex("by_updated")
            .order("desc")
            .take(SUBJECT_LIMIT);
      return rows
        .filter((row) => !row.archivedAt)
        .map((row) => ({
          id: row._id as string,
          name: row.name,
          meta: row.domain ?? null,
        }));
    }
    if (kind === "person") {
      const rows = text
        ? await ctx.db
            .query("people")
            .withSearchIndex("search_text", (q) => q.search("searchText", text))
            .take(SUBJECT_LIMIT)
        : await ctx.db
            .query("people")
            .withIndex("by_updated")
            .order("desc")
            .take(SUBJECT_LIMIT);
      return rows
        .filter((row) => !row.archivedAt && !row.erasedAt)
        .map((row) => ({
          id: row._id as string,
          name: `${row.firstName} ${row.lastName}`.trim(),
          meta: row.email ?? null,
        }));
    }
    if (kind === "lead") {
      const rows = await ctx.db.query("leads").order("desc").take(300);
      return rows
        .filter(
          (row) =>
            !row.erasedAt && (matches(row.name) || matches(row.companyName)),
        )
        .slice(0, SUBJECT_LIMIT)
        .map((row) => ({
          id: row._id as string,
          name: row.name,
          meta: row.companyName,
        }));
    }
    const rows = await ctx.db.query("deals").order("desc").take(300);
    return rows
      .filter((row) => matches(row.title))
      .slice(0, SUBJECT_LIMIT)
      .map((row) => ({ id: row._id as string, name: row.title, meta: null }));
  },
});

/** Walks the current draft for one record without doing anything. */
export const dryRun = memberQuery({
  args: { id: v.id("automations"), target: vTarget },
  handler: async (ctx, { id, target }) => {
    const automation = await requireAutomation(ctx, id);
    if (target.kind !== automation.subjectKind) {
      invalid(
        "target",
        `This automation runs on ${SUBJECT_LABEL[automation.subjectKind][1]}`,
      );
    }
    const subject = await loadSubject(ctx, target);
    if (!subject) notFound(SUBJECT_LABEL[target.kind][0]);
    const { facts, consent } = await subjectFacts(ctx, subject);
    const vars = await subjectVars(ctx, subject);
    const now = Date.now();
    const steps = simulate({
      draft: draftOf(automation),
      facts,
      consent,
      vars,
      now,
      names: await nameLookup(ctx),
    });
    return {
      subject: { name: subject.name, href: subject.href, gone: subject.gone },
      now,
      steps,
    };
  },
});

// ── Editing ─────────────────────────────────────────────────────────────────

function cleanName(name: string) {
  const value = name.trim();
  if (!value) invalid("name", "Give the automation a name");
  if (value.length > LIMITS.name)
    invalid("name", `Use up to ${LIMITS.name} characters`);
  return value;
}

function cleanDescription(description: string) {
  const value = description.trim();
  if (value.length > LIMITS.description) {
    invalid("description", `Use up to ${LIMITS.description} characters`);
  }
  return value;
}

function cleanGraph(graph: Graph) {
  const problem = checkGraphShape(graph);
  if (problem) invalid("graph", problem);
  return graph;
}

const EMPTY_STATS = {
  enrolled: 0,
  active: 0,
  completed: 0,
  exited: 0,
  failed: 0,
};

async function insertAutomation(
  ctx: MutationCtx & { viewer: Doc<"members"> },
  fields: Pick<
    Doc<"automations">,
    "name" | "description" | "subjectKind" | "trigger" | "graph" | "settings"
  > & { templateKey?: string },
) {
  return await ctx.db.insert("automations", {
    ...fields,
    status: "draft",
    version: 0,
    stats: EMPTY_STATS,
    createdById: ctx.viewer._id,
    updatedAt: Date.now(),
  });
}

export const create = managerMutation({
  args: {
    name: v.optional(v.string()),
    subjectKind: v.optional(vSubjectKind),
    triggerKind: v.optional(vTrigger.fields.kind),
  },
  handler: async (
    ctx,
    { name, subjectKind = "lead", triggerKind = "manual" },
  ) => {
    if (!TRIGGER_SUBJECTS[triggerKind].includes(subjectKind)) {
      invalid("subjectKind", "That trigger can't enrol these records");
    }
    return await insertAutomation(ctx, {
      name: cleanName(name ?? "Untitled automation"),
      description: "",
      subjectKind,
      trigger: { kind: triggerKind },
      graph: {
        nodes: [{ id: "trigger", kind: "trigger", x: -160, y: 0, config: {} }],
        edges: [],
      },
      settings: DEFAULT_SETTINGS,
    });
  },
});

export const createFromTemplate = memberMutation({
  args: { key: v.string(), language: v.optional(vLanguage) },
  handler: async (ctx, { key, language }) => {
    const template = TEMPLATE[key];
    if (!template) notFound("Template");
    const copy = templateIn(template, language);
    return await insertAutomation(ctx, {
      name: template.name,
      description: copy.description,
      subjectKind: template.subjectKind,
      // An automatic trigger would run a rep's copy on everyone's records.
      trigger: can(ctx.viewer, "sequence.run")
        ? template.trigger
        : { kind: "manual" },
      graph: copy.graph,
      settings:
        copy.language === "en"
          ? template.settings
          : { ...template.settings, language: copy.language },
      templateKey: template.key,
    });
  },
});

export const update = managerMutation({
  args: {
    id: v.id("automations"),
    patch: v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      subjectKind: v.optional(vSubjectKind),
      trigger: v.optional(vTrigger),
      graph: v.optional(vGraph),
      settings: v.optional(vSettings),
    }),
  },
  handler: async (ctx, { id, patch }) => {
    const automation = await requireAutomation(ctx, id);
    const next: Partial<Doc<"automations">> = { updatedAt: Date.now() };
    if (patch.name !== undefined) next.name = cleanName(patch.name);
    if (patch.description !== undefined)
      next.description = cleanDescription(patch.description);
    if (patch.graph !== undefined)
      next.graph = cleanGraph(patch.graph as Graph);
    if (patch.trigger !== undefined) next.trigger = patch.trigger;
    if (patch.settings !== undefined) {
      next.settings = withSender(patch.settings, automation.settings);
    }
    if (patch.subjectKind !== undefined) {
      next.subjectKind = patch.subjectKind;
      const trigger = next.trigger ?? automation.trigger;
      if (!TRIGGER_SUBJECTS[trigger.kind].includes(patch.subjectKind)) {
        next.trigger = { kind: "manual" };
      }
    }
    await ctx.db.patch(id, next);
    return {
      name: automation.name,
      description: automation.description,
    };
  },
});

/** Changes who emails appear to come from; takes effect on the live version without republishing. */
export const setSender = memberMutation({
  args: {
    id: v.id("automations"),
    senderName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
  },
  handler: async (ctx, { id, ...input }) => {
    const automation = await requireAutomation(ctx, id);
    assertOwnSequence(ctx, automation);
    const checked = checkSender(input);
    if (!checked.ok) invalid(checked.field, checked.message);
    const { published } = automation;
    await ctx.db.patch(id, {
      settings: withSender(automation.settings, checked),
      ...(published && {
        published: {
          ...published,
          settings: withSender(published.settings, checked),
        },
      }),
      updatedAt: Date.now(),
    });
    return {
      previous: {
        senderName: automation.settings.senderName,
        replyTo: automation.settings.replyTo,
      },
    };
  },
});

/** Publishes the draft (a new version when it changed) and starts enrolling. */
export const activate = memberMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await requireAutomation(ctx, id);
    assertOwnSequence(ctx, automation);
    const issues = validateAutomation(
      draftOf(automation),
      await validationContext(ctx, id),
    );
    if (issues.length) {
      fail(
        "invalid",
        issues.length === 1
          ? issues[0].message
          : `Fix ${issues.length} problems first, starting with: ${issues[0].message}`,
      );
    }
    const blocked = blockedReason(automation.graph as Graph);
    if (blocked) fail("conflict", blocked);
    const now = Date.now();
    const changed = hasChanges(automation);
    const version = changed ? automation.version + 1 : automation.version;
    await ctx.db.patch(id, {
      status: "active",
      version,
      published: changed
        ? {
            ...publishable(automation),
            version,
            publishedAt: now,
            publishedById: ctx.viewer._id,
          }
        : automation.published,
      updatedAt: now,
    });
    const resumed = await resumeHeld(ctx, id);
    return { version, resumed, previous: automation.status };
  },
});

export const pause = memberMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await requireAutomation(ctx, id);
    assertOwnSequence(ctx, automation);
    if (automation.status !== "active") return { previous: automation.status };
    await ctx.db.patch(id, { status: "paused", updatedAt: Date.now() });
    return { previous: automation.status };
  },
});

export const duplicate = managerMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await requireAutomation(ctx, id);
    return await insertAutomation(ctx, {
      name: `${automation.name} (copy)`.slice(0, LIMITS.name),
      description: automation.description,
      subjectKind: automation.subjectKind,
      trigger: automation.trigger,
      graph: automation.graph,
      settings: automation.settings,
      templateKey: automation.templateKey,
    });
  },
});

/** Deletes the automation and ends its live runs; undo brings the automation back paused. */
export const remove = memberMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await requireAutomation(ctx, id);
    assertOwnSequence(ctx, automation);
    const now = Date.now();
    await ctx.db.patch(id, {
      deletedAt: now,
      status: automation.status === "active" ? "paused" : automation.status,
      updatedAt: now,
    });
    let ended = 0;
    for (const status of ["running", "waiting"] as const) {
      const live = await ctx.db
        .query("automationEnrollments")
        .withIndex("by_automation", (q) =>
          q.eq("automationId", id).eq("status", status),
        )
        .collect();
      for (const enrollment of live) {
        await finish(
          ctx,
          enrollment,
          "exited",
          "The automation was deleted",
          undefined,
          "deleted",
        );
        ended++;
      }
    }
    return { ended };
  },
});

export const restore = memberMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await ctx.db.get(id);
    if (!automation) notFound("Automation");
    assertOwnSequence(ctx, automation);
    await ctx.db.patch(id, { deletedAt: undefined, updatedAt: Date.now() });
  },
});

/** Emails the first email step to the viewer with sample values, and tells them how it went. */
export const sendTest = memberMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const { ok } = await rateLimiter.limit(ctx, "testEmail", {
      key: ctx.viewer._id,
    });
    if (!ok) fail("rate_limited", "Too many test emails. Try again later.");
    const automation = await requireAutomation(ctx, id);
    const graph = automation.graph as Graph;
    const node = stepOrder(graph)
      .map((nodeId) => graph.nodes.find((item) => item.id === nodeId))
      .find((item) => item?.kind === "send_email");
    if (!node) invalid("id", "This sequence has no email to test");
    const provider = emailProvider().provider;
    if (provider === "outbox") fail("conflict", blockedReason(graph)!);
    const vars: Record<string, string> = Object.fromEntries(
      VARIABLES.map((item) => [item.key, item.example]),
    );
    vars["owner.firstName"] = ctx.viewer.name.split(/\s+/)[0];
    const rendered = renderEmail(
      configOf(node, "send_email"),
      vars,
      automation.settings.language,
    );
    await ctx.scheduler.runAfter(0, internal.automations.deliverTest, {
      memberId: ctx.viewer._id,
      to: ctx.viewer.email,
      subject: `[Test] ${rendered.subject}`,
      body: rendered.body,
      senderName: automation.settings.senderName,
      replyTo: automation.settings.replyTo,
    });
    return ctx.viewer.email;
  },
});

export const deliverTest = internalAction({
  args: {
    memberId: v.id("members"),
    to: v.string(),
    subject: v.string(),
    body: v.string(),
    senderName: v.optional(v.string()),
    replyTo: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { memberId, to, subject, body, senderName, replyTo },
  ) => {
    const result = await deliverMessage(ctx, {
      channel: "email",
      provider: emailProvider().provider,
      stepKey: `test:${memberId}:${Date.now()}`,
      recipientId: memberId,
      to,
      subject,
      body,
      senderName,
      replyTo,
    });
    await ctx.runMutation(internal.automations.testSettled, {
      memberId,
      error: result.ok ? undefined : result.error.slice(0, 200),
    });
  },
});

export const testSettled = internalMutation({
  args: { memberId: v.id("members"), error: v.optional(v.string()) },
  handler: async (ctx, { memberId, error }) => {
    await notify(ctx, memberId, {
      kind: "automation",
      title: error ? "Test email failed" : "Test email sent",
      body: error ?? "Check your inbox.",
    });
  },
});

// ── Runs ────────────────────────────────────────────────────────────────────

export const exitEnrollment = memberMutation({
  args: { id: v.id("automationEnrollments") },
  handler: async (ctx, { id }) => {
    const enrollment = await ctx.db.get(id);
    if (!enrollment) notFound("Run");
    if (!isLive(enrollment.status)) fail("conflict", "This run already ended");
    await assertOwnsRecord(ctx, subjectOf(enrollment));
    await finish(
      ctx,
      enrollment,
      "exited",
      `Removed by ${ctx.viewer.name}`,
      undefined,
      "manual",
    );
  },
});

// ── Engine entry points ─────────────────────────────────────────────────────

/** Runs one step; a throw rolls the step back and is retried with backoff. */
export const run = internalAction({
  args: { enrollmentId: v.id("automationEnrollments"), stepKey: v.string() },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.automations.step, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.automations.failStep, {
        ...args,
        error: message.slice(0, 500),
      });
    }
  },
});

export const step = internalMutation({
  args: { enrollmentId: v.id("automationEnrollments"), stepKey: v.string() },
  handler: async (ctx, { enrollmentId, stepKey }) => {
    return await runStep(ctx, enrollmentId, stepKey);
  },
});

export const failStep = internalMutation({
  args: {
    enrollmentId: v.id("automationEnrollments"),
    stepKey: v.string(),
    error: v.string(),
  },
  handler: async (ctx, { enrollmentId, stepKey, error }) => {
    await stepFailed(ctx, enrollmentId, stepKey, error);
  },
});

/** Moves a queued message to "sending" so only one delivery attempt holds it. */
export const claimMessage = internalMutation({
  args: { messageId: v.id("automationMessages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (
      !message ||
      message.status !== "queued" ||
      message.provider === "outbox" ||
      (await killSwitchOn(ctx))
    ) {
      return null;
    }
    await ctx.db.patch(messageId, {
      status: "sending",
      attempts: message.attempts + 1,
    });
    const automation = await ctx.db.get(message.automationId);
    const settings = automation?.published?.settings ?? automation?.settings;
    return {
      senderName: settings?.senderName,
      replyTo: settings?.replyTo,
      channel: message.channel,
      provider: message.provider as "resend" | "novu" | "meta",
      stepKey: message.stepKey,
      recipientId: (message.personId ?? message.leadId ?? message.to) as string,
      to: message.to,
      subject: message.subject,
      body: message.body,
      template: message.template,
      language: message.language,
      params: message.params,
    };
  },
});

async function restamp(
  ctx: MutationCtx,
  message: Doc<"automationMessages">,
  line: string,
) {
  if (!message.timelineId) return;
  const entry = await ctx.db.get(message.timelineId);
  if (!entry?.body) return;
  const [, ...rest] = entry.body.split("\n\n");
  await ctx.db.patch(entry._id, { body: [line, ...rest].join("\n\n") });
}

export const settleMessage = internalMutation({
  args: {
    messageId: v.id("automationMessages"),
    ok: v.boolean(),
    providerMessageId: v.optional(v.string()),
    error: v.optional(v.string()),
    retryable: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    { messageId, ok, providerMessageId, error, retryable },
  ) => {
    const message = await ctx.db.get(messageId);
    if (!message || message.status !== "sending") return;
    const automation = await ctx.db.get(message.automationId);
    const name = automation?.name ?? "an automation";
    const enrollment = {
      _id: message.enrollmentId,
      automationId: message.automationId,
    };
    if (ok) {
      await ctx.db.patch(messageId, {
        status: "sent",
        sentAt: Date.now(),
        providerMessageId,
        error: undefined,
      });
      await restamp(
        ctx,
        message,
        `Sent by the automation “${name}” via ${message.provider}.`,
      );
      await logStep(
        ctx,
        enrollment,
        "success",
        `Delivered the ${message.channel} to ${message.to}`,
        undefined,
        message.stepKey,
      );
      return;
    }
    if (retryable && message.attempts < DELIVERY_ATTEMPTS) {
      const delay = DELIVERY_RETRY_MS * 2 ** (message.attempts - 1);
      await ctx.db.patch(messageId, { status: "queued", error });
      await ctx.scheduler.runAfter(delay, internal.automations.deliver, {
        messageId,
      });
      await logStep(
        ctx,
        enrollment,
        "warning",
        `Delivery attempt ${message.attempts} failed (${error}); retrying`,
        undefined,
        message.stepKey,
      );
      return;
    }
    await ctx.db.patch(messageId, { status: "failed", error });
    await restamp(
      ctx,
      message,
      `Not sent: the automation “${name}” couldn't deliver it (${error}).`,
    );
    await logStep(
      ctx,
      enrollment,
      "error",
      `Couldn't deliver the ${message.channel} to ${message.to}: ${error}`,
      undefined,
      message.stepKey,
    );
  },
});

export const deliver = internalAction({
  args: { messageId: v.id("automationMessages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.runMutation(internal.automations.claimMessage, {
      messageId,
    });
    if (!message) return;
    const result = await deliverMessage(ctx, {
      ...message,
      recipientId: String(message.recipientId),
    });
    await ctx.runMutation(
      internal.automations.settleMessage,
      result.ok
        ? { messageId, ok: true, providerMessageId: result.providerMessageId }
        : {
            messageId,
            ok: false,
            error: result.error.slice(0, 500),
            retryable: result.retryable,
          },
    );
  },
});

// ── Manual enrolment (public contract) ──────────────────────────────────────

const MAX_ENROL = 200;
const CONTEXT_LIMITS = { keys: 10, value: 500 } as const;
const CONTEXT_KEY = /^(prospect\.)?[a-zA-Z][a-zA-Z0-9]{0,39}$/;

const vEnrolSubject = v.object({
  kind: vSubjectKind,
  id: v.string(),
  /** Values for `{{prospect.*}}`: `{ talkingPoint: "…" }` or `{ "prospect.talkingPoint": "…" }`. */
  context: v.optional(v.record(v.string(), v.string())),
});

function cleanContext(context: Record<string, string> | undefined) {
  if (!context) return undefined;
  const entries = Object.entries(context).filter(([, value]) => value.trim());
  if (entries.length > CONTEXT_LIMITS.keys) {
    invalid("context", `Use up to ${CONTEXT_LIMITS.keys} values per record`);
  }
  const out: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (!CONTEXT_KEY.test(key)) {
      invalid("context", `“${key}” isn't a valid name`);
    }
    if (value.length > CONTEXT_LIMITS.value) {
      invalid(
        "context",
        `Keep “${key}” under ${CONTEXT_LIMITS.value} characters`,
      );
    }
    out[key.startsWith("prospect.") ? key : `prospect.${key}`] = value.trim();
  }
  return out;
}

/**
 * Enrols records in an active automation by hand, up to 200 at a time.
 * Records already running in it, or that went through it without
 * re-enrolment allowed, are counted and skipped rather than failing the call.
 */
export const enrolMany = memberMutation({
  args: {
    automationId: v.id("automations"),
    subjects: v.array(vEnrolSubject),
  },
  handler: async (ctx, { automationId, subjects }) => {
    if (subjects.length === 0) invalid("subjects", "Pick at least one record");
    if (subjects.length > MAX_ENROL) {
      invalid("subjects", `Enrol up to ${MAX_ENROL} records at a time`);
    }
    const automation = await requireAutomation(ctx, automationId);
    if (await killSwitchOn(ctx)) {
      fail(
        "conflict",
        "Automations are stopped for the whole workspace. An admin can restart them in Settings → Workspace.",
      );
    }
    if (automation.status !== "active" || !automation.published) {
      fail("conflict", `“${automation.name}” isn't active`);
    }
    const counts = {
      enrolled: 0,
      alreadyRunning: 0,
      alreadyFinished: 0,
      skipped: 0,
    };
    const problems = new Map<string, number>();
    const enrollmentIds: Id<"automationEnrollments">[] = [];
    const seen = new Set<string>();
    for (const subject of subjects) {
      const key = subjectKey(subject.kind, subject.id);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!(await ownsRecord(ctx, subject))) {
        counts.skipped++;
        const message = "Only the record's owner can add it";
        problems.set(message, (problems.get(message) ?? 0) + 1);
        continue;
      }
      const result = await enroll(
        ctx,
        automation,
        { kind: subject.kind, id: subject.id },
        `Enrolled by ${ctx.viewer.name}`,
        ctx.viewer._id,
        cleanContext(subject.context),
      );
      if (result.outcome === "enrolled") {
        counts.enrolled++;
        enrollmentIds.push(result.enrollmentId);
      } else if (result.outcome === "already") counts.alreadyRunning++;
      else if (result.outcome === "finished") counts.alreadyFinished++;
      else {
        counts.skipped++;
        problems.set(result.message, (problems.get(result.message) ?? 0) + 1);
      }
    }
    return {
      automation: automation.name,
      total: seen.size,
      ...counts,
      problems: [...problems].map(([message, count]) => ({ message, count })),
      enrollmentIds,
    };
  },
});

/** Active automations a teammate can enrol this kind of record in. */
export const manualTargets = memberQuery({
  args: { kind: vSubjectKind },
  handler: async (ctx, { kind }) => {
    const active = await ctx.db
      .query("automations")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
    return active
      .filter((item) => !item.deletedAt && item.published?.subjectKind === kind)
      .map((item) => ({
        _id: item._id,
        name: item.name,
        trigger: TRIGGER_LABEL[item.published!.trigger.kind],
        manual: item.published!.trigger.kind === "manual",
        active: item.stats.active,
      }))
      .sort(
        (a, b) =>
          Number(b.manual) - Number(a.manual) || a.name.localeCompare(b.name),
      );
  },
});

export const pauseEnrollment = memberMutation({
  args: { id: v.id("automationEnrollments") },
  handler: async (ctx, { id }) => {
    const enrollment = await ctx.db.get(id);
    if (!enrollment) notFound("Run");
    if (!isLive(enrollment.status)) fail("conflict", "This run already ended");
    if (enrollment.pausedById) fail("conflict", "This run is already paused");
    await assertOwnsRecord(ctx, subjectOf(enrollment));
    await pauseRun(ctx, enrollment, ctx.viewer._id, ctx.viewer.name);
  },
});

export const resumeEnrollment = memberMutation({
  args: { id: v.id("automationEnrollments") },
  handler: async (ctx, { id }) => {
    const enrollment = await ctx.db.get(id);
    if (!enrollment) notFound("Run");
    if (!isLive(enrollment.status)) fail("conflict", "This run already ended");
    if (!enrollment.pausedById) fail("conflict", "This run isn't paused");
    await assertOwnsRecord(ctx, subjectOf(enrollment));
    await resumeRun(ctx, enrollment, ctx.viewer.name);
  },
});

// ── Analytics ───────────────────────────────────────────────────────────────

const MESSAGE_STATUSES = ["queued", "sending", "sent", "failed"] as const;
type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** How the automation performs: runs by outcome, the step funnel, messages and replies. */
export const analytics = memberQuery({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await ctx.db.get(id);
    if (!automation || automation.deletedAt) return null;
    const runs = await ctx.db
      .query("automationEnrollments")
      .withIndex("by_automation", (q) => q.eq("automationId", id))
      .order("desc")
      .take(MAX_ENROLLMENTS_SCAN);
    const counts = {
      enrolled: runs.length,
      active: 0,
      paused: 0,
      completed: 0,
      exited: 0,
      failed: 0,
    };
    const exits = new Map<string, number>();
    for (const run of runs) {
      if (isLive(run.status)) {
        counts.active++;
        if (run.pausedById || run.heldAt) counts.paused++;
      } else counts[run.status]++;
      if (run.status === "exited" || run.status === "failed") {
        const kind =
          run.exitKind ?? (run.status === "failed" ? "failed" : "other");
        exits.set(kind, (exits.get(kind) ?? 0) + 1);
      }
    }

    const messages: Doc<"automationMessages">[] = [];
    for (const status of MESSAGE_STATUSES) {
      messages.push(
        ...(await ctx.db
          .query("automationMessages")
          .withIndex("by_automation", (q) =>
            q.eq("automationId", id).eq("status", status),
          )
          .collect()),
      );
    }
    const byStatus = (channel: "email" | "whatsapp") =>
      Object.fromEntries(
        MESSAGE_STATUSES.map((status) => [
          status,
          messages.filter(
            (message) =>
              message.channel === channel && message.status === status,
          ).length,
        ]),
      ) as Record<MessageStatus, number>;
    const outbox = messages.filter(
      (message) => message.provider === "outbox" && message.status === "queued",
    ).length;

    const messaged = new Set(messages.map((message) => message.enrollmentId));
    const contacted = runs.filter((run) => messaged.has(run._id));
    const replied = contacted.filter((run) => run.repliedAt).length;

    const graph = (automation.published?.graph ?? automation.graph) as Graph;
    const funnel = nodeFunnel(runs);
    const names = await nameLookup(ctx);
    const trigger = automation.published?.trigger ?? automation.trigger;
    const steps = stepOrder(graph)
      .map((nodeId) => graph.nodes.find((node) => node.id === nodeId))
      .filter((node) => node !== undefined)
      .map((node) => ({
        nodeId: node.id,
        kind: node.kind,
        title: node.title?.trim() || describeNode(node, trigger, names),
        reached: funnel[node.id]?.reached ?? 0,
        passed: funnel[node.id]?.passed ?? 0,
        current: funnel[node.id]?.current ?? 0,
        skipped: funnel[node.id]?.skipped ?? 0,
        ended: funnel[node.id]?.ended ?? 0,
      }));

    return {
      counts,
      truncated: runs.length >= MAX_ENROLLMENTS_SCAN,
      exits: [...exits]
        .map(([kind, count]) => ({
          kind,
          label: EXIT_KIND_LABEL[kind as keyof typeof EXIT_KIND_LABEL] ?? kind,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      steps,
      messages: {
        total: messages.length,
        outbox,
        email: byStatus("email"),
        whatsapp: byStatus("whatsapp"),
      },
      replies: {
        contacted: contacted.length,
        replied,
        rate: percent(replied, contacted.length),
      },
    };
  },
});

// ── Template preview ────────────────────────────────────────────────────────

/** Fills message text for one record, as a send would, and reports variables left empty. */
export const preview = memberQuery({
  args: {
    target: vTarget,
    texts: v.array(v.string()),
    context: v.optional(v.record(v.string(), v.string())),
    channel: v.optional(v.union(v.literal("email"), v.literal("whatsapp"))),
  },
  handler: async (ctx, { target, texts, context, channel }) => {
    if (texts.length > 20) invalid("texts", "Preview up to 20 texts");
    const subject = await loadSubject(ctx, target);
    if (!subject) return null;
    const recipient = await recipientFor(ctx, subject, channel ?? "email");
    const vars = await subjectVars(
      ctx,
      subject,
      recipient,
      cleanContext(context),
    );
    return {
      record: subject.name,
      recipient: recipient
        ? {
            name: recipient.name,
            address:
              (channel === "whatsapp" ? recipient.phone : recipient.email) ??
              null,
          }
        : null,
      results: texts.map((text) => renderTemplate(text, vars)),
    };
  },
});

// ── Safety ──────────────────────────────────────────────────────────────────

export const safety = memberQuery({
  args: {},
  handler: async (ctx) => {
    const current = await readSafety(ctx);
    const by = current.killSwitch
      ? await ctx.db.get(current.killSwitch.byId)
      : null;
    const held = current.killSwitch
      ? (
          await ctx.db
            .query("automationEnrollments")
            .withIndex("by_status", (q) => q.eq("status", "waiting"))
            .take(MAX_ENROLLMENTS_SCAN)
        ).filter((row) => row.heldAt && !row.pausedById).length
      : 0;
    return {
      killSwitch: current.killSwitch
        ? { at: current.killSwitch.at, by: by?.name ?? "An admin" }
        : null,
      held,
      frequencyCap: current.frequencyCap,
      frequencyCapIsDefault: current.frequencyCapIsDefault,
      frequencyCapLimits: FREQUENCY_CAP,
    };
  },
});

/**
 * Stops or restarts every automation. While stopped, runs hold where they
 * are, nothing new enrols and queued messages aren't delivered; restarting
 * picks all of them back up. Returns the previous state for undo.
 */
export const setKillSwitch = adminMutation({
  args: { on: v.boolean() },
  handler: async (ctx, { on }) => {
    const previous = (await readSafety(ctx)).killSwitch !== null;
    if (on === previous) return { previous, resumed: 0, requeued: 0 };
    if (on) {
      await writeSetting(
        ctx,
        SAFETY_KEYS.killSwitch,
        JSON.stringify({ at: Date.now(), byId: ctx.viewer._id }),
      );
      return { previous, resumed: 0, requeued: 0 };
    }
    await writeSetting(ctx, SAFETY_KEYS.killSwitch, null);
    const resumed = await resumeAllHeld(ctx);
    const queued = await ctx.db
      .query("automationMessages")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .collect();
    let requeued = 0;
    for (const message of queued) {
      if (message.provider === "outbox") continue;
      await ctx.scheduler.runAfter(0, internal.automations.deliver, {
        messageId: message._id,
      });
      requeued++;
    }
    return { previous, resumed, requeued };
  },
});

/** Most automated messages one person may get in 7 days; `null` restores the default. */
export const setFrequencyCap = adminMutation({
  args: { value: v.union(v.number(), v.null()) },
  handler: async (ctx, { value }) => {
    if (value !== null && !isValidFrequencyCap(value)) {
      invalid(
        "frequencyCap",
        `Use a whole number from ${FREQUENCY_CAP.min} to ${FREQUENCY_CAP.max}`,
      );
    }
    const previous = await writeSetting(
      ctx,
      SAFETY_KEYS.frequencyCap,
      value === null ? null : String(value),
    );
    return { previous: previous === null ? null : Number(previous) };
  },
});
