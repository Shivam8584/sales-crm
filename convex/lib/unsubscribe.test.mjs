import assert from "node:assert/strict";
import test from "node:test";
import { asksToStop } from "./automations/engine.ts";
import { unsubscribeLine } from "./automations/delivery.ts";

test("short opt-out replies are recognised", () => {
  for (const text of [
    "Unsubscribe",
    "Please unsubscribe me",
    "STOP.",
    "Remove me from this list",
    "Stop emailing me",
    "mail band karo",
    "Ye emails band kar do",
    "please mat bhejo",
    "ये ईमेल बंद करो",
    "ईमेल बंद कर दो",
    "मत भेजो",
    "अब मत भेजना",
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
    "unsubscribe mat karo",
    "mail band mat karo",
    "mat band karo",
    "बंद मत करो",
    "मत बंद करो",
    "unsubscribe मत करो",
    "इसे करोड़ों में बंद करोड़",
    "बंद करोड़पति",
  ]) {
    assert.equal(asksToStop(text), false, text);
  }
});

test("every footer carries the word replies are matched on", () => {
  assert.equal(unsubscribeLine(), unsubscribeLine("en"));
  for (const language of ["en", "hinglish", "hi"]) {
    assert.match(unsubscribeLine(language), /"unsubscribe"/, language);
  }
});
