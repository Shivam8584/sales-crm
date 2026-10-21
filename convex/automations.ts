import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
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
  checkGraphShape,
  describeNode,
  describeTrigger,
  isLive,
  simulate,
  subjectKey,
  validateAutomation,
  type AutomationDraft,
  type Graph,
  type NameLookup,
  type ValidationContext,
} from "../lib/domain/automations";
import { STALL_RULES } from "./lib/activation";
import {
  enroll,
  finish,
  logStep,
  resumeHeld,
  runStep,
  stepFailed,
} from "./lib/automations/engine";
import {
  deliver as deliverMessage,
  emailProvider,
  whatsappProvider,
} from "./lib/automations/delivery";
import {
  loadSubject,
  subjectFacts,
  subjectVars,
} from "./lib/automations/subject";
import { TEMPLATE, TEMPLATES } from "./lib/automations/templates";
import {
  vGraph,
  vSettings,
  vSubjectKind,
  vTrigger,
} from "./lib/automations/validators";
import { fail, invalid, notFound } from "./lib/errors";
import { managerMutation, memberMutation, memberQuery } from "./lib/functions";
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
      version: automation.version,
      publishedAt: automation.published?.publishedAt ?? null,
      hasChanges: hasChanges(automation),
      stats: automation.stats,
      updatedAt: automation.updatedAt,
      issues,
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
        description: template.description,
        subjectKind: template.subjectKind,
        trigger: describeTrigger(template.trigger),
        steps: stepKinds(template.graph),
      })),
      providers: { email: emailProvider(), whatsapp: whatsappProvider() },
    };
  },
});

/** Per step: how many runs reached it, are on it now, and which path they took. */
export const nodeStats = memberQuery({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const enrollments = await ctx.db
      .query("automationEnrollments")
      .withIndex("by_automation", (q) => q.eq("automationId", id))
      .order("desc")
      .take(MAX_ENROLLMENTS_SCAN);
    const stats: Record<
      string,
      {
        entered: number;
        current: number;
        ports: Record<string, number>;
        lastAt: number | null;
      }
    > = {};
    const at = (nodeId: string) =>
      (stats[nodeId] ??= { entered: 0, current: 0, ports: {}, lastAt: null });
    for (const enrollment of enrollments) {
      const seen = new Set<string>();
      for (const entry of enrollment.history) {
        const item = at(entry.nodeId);
        if (!seen.has(entry.nodeId)) item.entered++;
        seen.add(entry.nodeId);
        item.ports[entry.outcome] = (item.ports[entry.outcome] ?? 0) + 1;
        item.lastAt = Math.max(item.lastAt ?? 0, entry.at);
      }
      if (isLive(enrollment.status)) {
        const item = at(enrollment.currentNodeId);
        item.current++;
        if (!seen.has(enrollment.currentNodeId)) item.entered++;
      }
    }
    return stats;
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

export const enrollments = memberQuery({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const rows = await ctx.db
      .query("automationEnrollments")
      .withIndex("by_automation", (q) => q.eq("automationId", id))
      .order("desc")
      .take(LOG_PAGE);
    const out = [];
    for (const row of rows) {
      out.push({
        _id: row._id,
        status: row.status,
        currentNodeId: row.currentNodeId,
        nextRunAt: row.nextRunAt ?? null,
        enrolledAt: row.enrolledAt,
        finishedAt: row.finishedAt ?? null,
        exitReason: row.exitReason ?? null,
        held: Boolean(row.heldAt),
        subject: await subjectName(ctx, row),
      });
    }
    return out.sort((a, b) => b.enrolledAt - a.enrolledAt);
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
        held: Boolean(row.heldAt),
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

export const createFromTemplate = managerMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const template = TEMPLATE[key];
    if (!template) notFound("Template");
    return await insertAutomation(ctx, {
      name: template.name,
      description: template.description,
      subjectKind: template.subjectKind,
      trigger: template.trigger,
      graph: template.graph,
      settings: template.settings,
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
    if (patch.settings !== undefined) next.settings = patch.settings;
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

/** Publishes the draft (a new version when it changed) and starts enrolling. */
export const activate = managerMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await requireAutomation(ctx, id);
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

export const pause = managerMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await requireAutomation(ctx, id);
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
export const remove = managerMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await requireAutomation(ctx, id);
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
        await finish(ctx, enrollment, "exited", "The automation was deleted");
        ended++;
      }
    }
    return { ended };
  },
});

export const restore = managerMutation({
  args: { id: v.id("automations") },
  handler: async (ctx, { id }) => {
    const automation = await ctx.db.get(id);
    if (!automation) notFound("Automation");
    await ctx.db.patch(id, { deletedAt: undefined, updatedAt: Date.now() });
  },
});

// ── Runs ────────────────────────────────────────────────────────────────────

export const enrollRecord = memberMutation({
  args: { id: v.id("automations"), target: vTarget },
  handler: async (ctx, { id, target }) => {
    const automation = await requireAutomation(ctx, id);
    const result = await enroll(
      ctx,
      automation,
      target,
      `Enrolled by ${ctx.viewer.name}`,
      ctx.viewer._id,
    );
    if (result.outcome !== "enrolled") fail("conflict", result.message);
    return result.enrollmentId;
  },
});

export const exitEnrollment = memberMutation({
  args: { id: v.id("automationEnrollments") },
  handler: async (ctx, { id }) => {
    const enrollment = await ctx.db.get(id);
    if (!enrollment) notFound("Run");
    if (!isLive(enrollment.status)) fail("conflict", "This run already ended");
    await finish(ctx, enrollment, "exited", `Removed by ${ctx.viewer.name}`);
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
      message.provider === "outbox"
    ) {
      return null;
    }
    await ctx.db.patch(messageId, {
      status: "sending",
      attempts: message.attempts + 1,
    });
    return {
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
    const result = await deliverMessage({
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
