import { v } from "convex/values";
import { action } from "./_generated/server";
import { memberQuery } from "./lib/functions";
import { fail } from "./lib/errors";
import type {
  Brief,
  CallSummary,
  Capture,
  Draft,
  NextAction,
} from "./lib/aiTypes";

export const vTarget = v.union(
  v.object({ accountId: v.id("accounts") }),
  v.object({ personId: v.id("people") }),
  v.object({ leadId: v.id("leads") }),
  v.object({ dealId: v.id("deals") }),
);

const unavailable = (): never =>
  fail("unavailable", "AI is not set up on this server");

/** Whether an AI key is configured; the UI hides every AI surface when false. */
export const enabled = memberQuery({
  args: {},
  handler: async () => Boolean(process.env.OPENAI_API_KEY),
});

/** The cached brief for an account, or null if none has been generated. */
export const brief = memberQuery({
  args: { accountId: v.id("accounts") },
  handler: async (): Promise<Brief | null> => null,
});

export const generateBrief = action({
  args: { accountId: v.id("accounts") },
  handler: async (): Promise<void> => unavailable(),
});

/** Cached one-line suggestions for the viewer's Today items, keyed by record key (`leads:<id>`, `accounts:<id>`, `deals:<id>`). */
export const nextActions = memberQuery({
  args: {},
  handler: async (): Promise<Record<string, NextAction>> => ({}),
});

export const refreshNextActions = action({
  args: {},
  handler: async (): Promise<void> => unavailable(),
});

/** Turns a line like "call Kesar Leaf tomorrow about the proposal" into proposed records. Writes nothing. */
export const parseCapture = action({
  args: { text: v.string(), accountId: v.optional(v.id("accounts")) },
  handler: async (): Promise<Capture> => unavailable(),
});

export const draft = action({
  args: {
    target: vTarget,
    channel: v.union(v.literal("whatsapp"), v.literal("email")),
    goal: v.optional(v.string()),
  },
  handler: async (): Promise<Draft> => unavailable(),
});

export const summarizeCall = action({
  args: { target: vTarget, notes: v.string() },
  handler: async (): Promise<CallSummary> => unavailable(),
});
