import { v } from "convex/values";
import {
  AGENT_EVENTS,
  FREQUENCIES,
  RUN_STATUSES,
  RUN_TRIGGERS,
  SCOPES,
} from "../../../lib/domain/agents";
import { literals } from "../validators";

export const vTrigger = v.union(
  v.object({
    kind: v.literal("schedule"),
    every: literals(FREQUENCIES),
    hour: v.number(),
    weekday: v.optional(v.number()),
  }),
  v.object({ kind: v.literal("event"), event: literals(AGENT_EVENTS) }),
  v.object({ kind: v.literal("manual") }),
);

export const vScope = literals(SCOPES);
export const vRunStatus = literals(RUN_STATUSES);
export const vRunTrigger = literals(RUN_TRIGGERS);

export const vLogEntry = v.object({
  step: v.number(),
  tool: v.string(),
  args: v.string(),
  status: literals(["ok", "error", "planned"]),
  result: v.string(),
  at: v.number(),
});
