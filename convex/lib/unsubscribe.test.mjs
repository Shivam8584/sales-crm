import assert from "node:assert/strict";
import test from "node:test";
import { asksToStop } from "./automations/engine.ts";

test("short opt-out replies are recognised", () => {
  for (const text of [
    "Unsubscribe",
    "Please unsubscribe me",
    "STOP.",
    "Remove me from this list",
    "Stop emailing me",
    "mail band karo",
    "\n\nunsubscribe\n> On Mon, Hypedrive wrote:",
  ]) {
    assert.equal(asksToStop(text), true, text);
  }
});

test("negated, long or incidental mentions are not opt-outs", () => {
  for (const text of [
    "please don't unsubscribe me",
    "Do not unsubscribe me",
    "I won’t opt out",
    "Thanks, sounds good\n\nTo unsubscribe, reply stop",
    "How do I unsubscribe from the other newsletter and can we also schedule a call",
    "Stopping by tomorrow",
    '> Reply "unsubscribe" and I\'ll stop.',
  ]) {
    assert.equal(asksToStop(text), false, text);
  }
});
