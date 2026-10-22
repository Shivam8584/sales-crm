/**
 * Portable copies of a sequence: JSON, a steps spreadsheet and a Markdown brief.
 * They hold the sequence's own definition only (message templates with their
 * `{{placeholders}}`), never record data, database ids or counters.
 */
import { toCsv } from "../csv";
import {
  NODE_LABEL,
  PORTS,
  PORT_LABEL,
  SUBJECT_LABEL,
  TRIGGER_LABEL,
  conditionFields,
  configOf,
  describeNode,
  describeTrigger,
  formatIst,
  stepOrder,
  type AutomationSettings,
  type Condition,
  type Graph,
  type GraphNode,
  type NameLookup,
  type PortId,
  type SubjectKind,
  type Trigger,
} from "./automations";
import { PRIORITY_LABEL } from "./labels";

export type ExportFormat = "json" | "csv" | "markdown";

export const EXPORT_FORMATS: Record<
  ExportFormat,
  { label: string; extension: string; mime: string }
> = {
  json: { label: "Workflow JSON", extension: "json", mime: "application/json" },
  csv: { label: "Steps report", extension: "csv", mime: "text/csv" },
  markdown: {
    label: "Markdown brief",
    extension: "md",
    mime: "text/markdown",
  },
};

export const EXPORT_LOG_LIMIT = 100;

export type ExportSource = {
  name: string;
  description: string;
  subjectKind: SubjectKind;
  trigger: Trigger;
  settings: AutomationSettings;
  graph: Graph;
};

export type ExportLogLine = { at: number; level: string; message: string };

export type ExportOptions = {
  exportedAt: number;
  /** Trigger filters, conditions, goal and sending settings. */
  includeRules: boolean;
  /** Only read by JSON and Markdown. */
  logs?: ExportLogLine[];
  names?: NameLookup;
  describeCondition: (condition: Condition) => string;
};

export function exportFileName(name: string, format: ExportFormat) {
  const slug = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug.slice(0, 60) || "sequence"}.${EXPORT_FORMATS[format].extension}`;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, sortKeys(item)]),
    );
  }
  return value;
}

const memberFields = () =>
  new Set(
    conditionFields()
      .filter((field) => field.type === "member")
      .map((field) => field.key),
  );

function portableCondition(condition: Condition, names: NameLookup) {
  const isMember = memberFields().has(condition.field);
  return {
    field: condition.field,
    op: condition.op,
    ...(condition.value && {
      value: isMember
        ? condition.value.map((id) => names.member?.(id) ?? "a teammate")
        : condition.value,
    }),
  };
}

/** Replaces database ids in a step's settings with the names they stood for. */
function portableConfig(
  node: GraphNode,
  names: NameLookup,
  includeRules: boolean,
) {
  const config: Record<string, unknown> = { ...node.config };
  const swap = (
    idKey: string,
    nameKey: string,
    lookup: ((id: string) => string | undefined) | undefined,
  ) => {
    const id = config[idKey];
    delete config[idKey];
    const name = typeof id === "string" ? lookup?.(id) : undefined;
    if (name) config[nameKey] = name;
  };
  if (node.kind === "create_task" || node.kind === "notify") {
    swap("memberId", "memberName", names.member);
  } else if (node.kind === "automation") {
    swap("automationId", "automationName", names.automation);
  } else if (node.kind === "update_field" && config.field === "owner") {
    if (config.value !== "round_robin") {
      swap("value", "memberName", names.member);
    }
  } else if (node.kind === "condition") {
    const { match, conditions } = configOf(node, "condition");
    return {
      match,
      conditions: includeRules
        ? (conditions ?? []).map((item) => portableCondition(item, names))
        : [],
    };
  }
  return sortKeys(config);
}

function steps(graph: Graph) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return stepOrder(graph).flatMap((id) => byId.get(id) ?? []);
}

const logLines = (logs: ExportLogLine[] | undefined) =>
  [...(logs ?? [])].sort((a, b) => a.at - b.at).slice(-EXPORT_LOG_LIMIT);

function buildJson(source: ExportSource, options: ExportOptions) {
  const names = options.names ?? {};
  const order = steps(source.graph);
  const rank = new Map(order.map((node, index) => [node.id, index]));
  const { settings } = source;
  const logs = logLines(options.logs);
  return JSON.stringify(
    {
      app: "hypedrive-crm",
      format: 1,
      exportedAt: new Date(options.exportedAt).toISOString(),
      automation: {
        name: source.name,
        description: source.description,
        subjectKind: source.subjectKind,
        trigger: options.includeRules
          ? sortKeys(source.trigger)
          : { kind: source.trigger.kind },
        ...(options.includeRules && {
          settings: {
            dailyCap: settings.dailyCap,
            quietHours: settings.quietHours,
            stopOnReply: settings.stopOnReply,
            allowReenroll: settings.allowReenroll,
            goal: settings.goal.map((item) => portableCondition(item, names)),
            ...(settings.senderName && { senderName: settings.senderName }),
            ...(settings.replyTo && { replyTo: settings.replyTo }),
          },
        }),
        graph: {
          nodes: order.map((node) => ({
            id: node.id,
            kind: node.kind,
            ...(node.title?.trim() && { title: node.title.trim() }),
            config: portableConfig(node, names, options.includeRules),
            x: node.x,
            y: node.y,
          })),
          edges: source.graph.edges
            .filter((edge) => rank.has(edge.source) && rank.has(edge.target))
            .sort(
              (a, b) =>
                rank.get(a.source)! - rank.get(b.source)! ||
                PORTS.indexOf(a.port) - PORTS.indexOf(b.port),
            )
            .map(({ source, port, target }) => ({ source, port, target })),
        },
      },
      ...(logs.length && {
        runLog: logs.map((line) => ({
          at: new Date(line.at).toISOString(),
          level: line.level,
          message: line.message,
        })),
      }),
    },
    null,
    2,
  );
}

const titleOf = (node: GraphNode, trigger: Trigger, names: NameLookup) =>
  node.title?.trim() || describeNode(node, trigger, names);

function conditionSummary(node: GraphNode, options: ExportOptions) {
  const { match, conditions } = configOf(node, "condition");
  return (conditions ?? [])
    .map(options.describeCondition)
    .join(match === "any" ? " or " : " and ");
}

function buildCsv(source: ExportSource, options: ExportOptions) {
  const names = options.names ?? {};
  const order = steps(source.graph);
  const number = new Map(order.map((node, index) => [node.id, index + 1]));
  const label = (id: string) => {
    const target = order[number.get(id)! - 1];
    return `Step ${number.get(id)}: ${titleOf(target, source.trigger, names)}`;
  };
  return toCsv([
    ["Step", "Type", "Title or subject", "Wait or condition", "Next"],
    ...order.map((node, index) => {
      const next = source.graph.edges
        .filter((edge) => edge.source === node.id && number.has(edge.target))
        .sort((a, b) => PORTS.indexOf(a.port) - PORTS.indexOf(b.port))
        .map(
          (edge) =>
            `${PORT_LABEL[edge.port] ? `${PORT_LABEL[edge.port]} → ` : ""}${label(edge.target)}`,
        );
      const detail =
        node.kind === "wait"
          ? describeNode(node, source.trigger, names)
          : node.kind === "condition" && options.includeRules
            ? conditionSummary(node, options)
            : "";
      return [
        index + 1,
        NODE_LABEL[node.kind],
        titleOf(node, source.trigger, names),
        detail,
        next.join(" | ") || (node.kind === "exit" ? "Ends the run" : "End"),
      ];
    }),
  ]);
}

const BRANCH: Record<PortId, string> = {
  out: "Next",
  yes: "If yes",
  no: "If no",
  met: "When it happens",
  timeout: "On timeout",
};

const yesNo = (value: boolean) => (value ? "Yes" : "No");

function stepDetails(
  node: GraphNode,
  options: ExportOptions,
  names: NameLookup,
): string[] {
  switch (node.kind) {
    case "send_email": {
      const { subject, body } = configOf(node, "send_email");
      return [
        `Subject: ${subject}`,
        "",
        ...(body ?? "").trim().split("\n"),
      ].map((line) => `> ${line}`.trimEnd());
    }
    case "send_whatsapp": {
      const { template, language, params } = configOf(node, "send_whatsapp");
      return [
        `Template ${template || "(none yet)"} in ${language || "?"}`,
        ...(params ?? []).map((param, index) => `{{${index + 1}}} ${param}`),
      ].map((line) => `> ${line}`);
    }
    case "create_task": {
      const config = configOf(node, "create_task");
      const who =
        config.assignee === "member"
          ? (names.member?.(config.memberId ?? "") ?? "a teammate")
          : config.assignee === "owner"
            ? "the record's owner"
            : "next in rotation";
      return [
        `Assigned to ${who}, due ${config.dueInDays === 0 ? "the same day" : `in ${config.dueInDays} days`}, ${(PRIORITY_LABEL[config.priority] ?? config.priority).toLowerCase()} priority`,
        ...(config.notes?.trim() ? [`> ${config.notes.trim()}`] : []),
      ];
    }
    case "condition":
      return options.includeRules
        ? [`Checks: ${conditionSummary(node, options) || "nothing yet"}`]
        : [];
    default:
      return [];
  }
}

function buildMarkdown(source: ExportSource, options: ExportOptions) {
  const names = options.names ?? {};
  const { settings, trigger } = source;
  const order = steps(source.graph);
  const number = new Map(order.map((node, index) => [node.id, index + 1]));
  const lines = [`# ${source.name}`, ""];
  if (source.description.trim()) lines.push(source.description.trim(), "");
  lines.push(
    `- **Enrols:** ${SUBJECT_LABEL[source.subjectKind][1]}`,
    `- **Starts when:** ${options.includeRules ? describeTrigger(trigger, names) : TRIGGER_LABEL[trigger.kind]}`,
    "",
    "## Steps",
    "",
  );
  for (const node of order) {
    const title = titleOf(node, trigger, names);
    lines.push(
      `${number.get(node.id)}. **${NODE_LABEL[node.kind]}**${node.kind === "send_email" && !node.title?.trim() ? "" : ` — ${title}`}`,
    );
    for (const line of stepDetails(node, options, names)) {
      lines.push(`   ${line}`.trimEnd());
    }
    for (const edge of source.graph.edges
      .filter((item) => item.source === node.id && number.has(item.target))
      .sort((a, b) => PORTS.indexOf(a.port) - PORTS.indexOf(b.port))) {
      const target = order[number.get(edge.target)! - 1];
      lines.push(
        `   - ${BRANCH[edge.port]}: step ${number.get(edge.target)}, ${titleOf(target, trigger, names)}`,
      );
    }
    if (!source.graph.edges.some((edge) => edge.source === node.id)) {
      lines.push(
        `   - ${node.kind === "exit" ? "Ends the run" : "End of the sequence"}`,
      );
    }
  }
  if (options.includeRules) {
    lines.push(
      "",
      "## Goal and exit conditions",
      "",
      `- **Goal:** ${settings.goal.length ? `a run ends once ${settings.goal.map(options.describeCondition).join(" and ")}` : "none"}`,
      `- **Stops when they engage:** ${yesNo(settings.stopOnReply)}`,
      `- **Quiet hours (9:00–20:00 IST):** ${yesNo(settings.quietHours)}`,
      `- **Re-enrolment allowed:** ${yesNo(settings.allowReenroll)}`,
      `- **Daily send cap:** ${settings.dailyCap}`,
    );
    if (settings.senderName) {
      lines.push(`- **Sender name:** ${settings.senderName}`);
    }
    if (settings.replyTo) lines.push(`- **Reply-to:** ${settings.replyTo}`);
  }
  const logs = logLines(options.logs);
  if (logs.length) {
    lines.push(
      "",
      "## Run log",
      "",
      ...logs.map(
        (line) =>
          `- ${formatIst(line.at)} · ${line.level} · ${line.message.replace(/\s+/g, " ")}`,
      ),
    );
  }
  return lines.join("\n");
}

export function buildAutomationExport(
  format: ExportFormat,
  source: ExportSource,
  options: ExportOptions,
) {
  return format === "json"
    ? buildJson(source, options)
    : format === "csv"
      ? buildCsv(source, options)
      : buildMarkdown(source, options);
}
