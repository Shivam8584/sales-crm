import { v } from "convex/values";
import {
  AUTOMATION_STATUSES,
  CONDITION_OPS,
  ENROLLMENT_STATUSES,
  EXIT_KINDS,
  NODE_KINDS,
  PORTS,
  SUBJECT_KINDS,
  TRIGGER_KINDS,
} from "../../../lib/domain/automations";
import { literals } from "../validators";

export const vAutomationStatus = literals(AUTOMATION_STATUSES);
export const vEnrollmentStatus = literals(ENROLLMENT_STATUSES);
export const vSubjectKind = literals(SUBJECT_KINDS);
export const vExitKind = literals(EXIT_KINDS);

const list = v.optional(v.array(v.string()));

export const vTrigger = v.object({
  kind: literals(TRIGGER_KINDS),
  leadKinds: list,
  leadSources: list,
  leadStatuses: list,
  dealStages: list,
  accountStages: list,
  eventTypes: list,
  campaignStatuses: list,
  pauseReasons: list,
  ruleIds: list,
  channels: list,
});

export const vCondition = v.object({
  field: v.string(),
  op: literals(CONDITION_OPS),
  value: list,
});

/** Step settings are checked by `validateAutomation`, which knows each kind's shape. */
export const vGraph = v.object({
  nodes: v.array(
    v.object({
      id: v.string(),
      kind: literals(NODE_KINDS),
      x: v.number(),
      y: v.number(),
      title: v.optional(v.string()),
      config: v.any(),
    }),
  ),
  edges: v.array(
    v.object({
      id: v.string(),
      source: v.string(),
      port: literals(PORTS),
      target: v.string(),
    }),
  ),
});

export const vSettings = v.object({
  dailyCap: v.number(),
  quietHours: v.boolean(),
  stopOnReply: v.boolean(),
  goal: v.array(vCondition),
  allowReenroll: v.boolean(),
});

export const vStats = v.object({
  enrolled: v.number(),
  active: v.number(),
  completed: v.number(),
  exited: v.number(),
  failed: v.number(),
});

export const vPublished = v.object({
  version: v.number(),
  subjectKind: vSubjectKind,
  trigger: vTrigger,
  graph: vGraph,
  settings: vSettings,
  publishedAt: v.number(),
  publishedById: v.id("members"),
});

export const vStepLevel = literals(["info", "success", "warning", "error"]);
export const vMessageStatus = literals(["queued", "sending", "sent", "failed"]);
export const vMessageChannel = literals(["email", "whatsapp"]);

export const vHistoryEntry = v.object({
  nodeId: v.string(),
  at: v.number(),
  outcome: v.string(),
});
