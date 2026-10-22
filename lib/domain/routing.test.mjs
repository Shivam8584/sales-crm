import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeCondition,
  parseRules,
  routeLead,
  rulesProblem,
} from "./routing.ts";

const facts = (overrides = {}) => ({
  kind: "demo",
  source: "demo_form",
  score: 50,
  hasGst: false,
  emailType: "company",
  ...overrides,
});
const rule = (id, when, assign) => ({ id, name: id, when, assign });
const everyone = () => true;

test("first matching rule wins, top to bottom", () => {
  const rules = [
    rule("a", { kind: "contact" }, { memberId: "m1" }),
    rule("b", { kind: "demo" }, { memberId: "m2" }),
    rule("c", { kind: "demo" }, { memberId: "m3" }),
  ];
  const hit = routeLead(rules, facts(), everyone);
  assert.equal(hit.rule.id, "b");
  assert.equal(hit.memberId, "m2");
});

test("no match returns null so the caller falls back to round-robin", () => {
  const rules = [rule("a", { kind: "signup" }, { memberId: "m1" })];
  assert.equal(routeLead(rules, facts(), everyone), null);
  assert.equal(routeLead([], facts(), everyone), null);
});

test("a rule for a deactivated member is skipped, not a dead end", () => {
  const rules = [
    rule("gone", { kind: "demo" }, { memberId: "m1" }),
    rule("next", {}, { memberId: "m2" }),
  ];
  const hit = routeLead(rules, facts(), (id) => id !== "m1");
  assert.equal(hit.rule.id, "next");
});

test("a round-robin rule matches but names nobody", () => {
  const hit = routeLead(
    [rule("rr", { kind: "demo" }, { roundRobin: true })],
    facts(),
    () => false,
  );
  assert.equal(hit.rule.id, "rr");
  assert.equal(hit.memberId, null);
});

test("hot lead rule uses the score threshold", () => {
  const rules = [rule("hot", { scoreMin: 70 }, { memberId: "m1" })];
  assert.equal(routeLead(rules, facts({ score: 69 }), everyone), null);
  assert.equal(routeLead(rules, facts({ score: 70 }), everyone).memberId, "m1");
});

test("every condition on a rule must hold", () => {
  const rules = [
    rule(
      "all",
      { kind: "demo", hasGst: true, emailType: "company", source: "demo_form" },
      { memberId: "m1" },
    ),
  ];
  assert.ok(routeLead(rules, facts({ hasGst: true }), everyone));
  assert.equal(routeLead(rules, facts({ hasGst: false }), everyone), null);
  assert.equal(
    routeLead(rules, facts({ hasGst: true, emailType: "free" }), everyone),
    null,
  );
  assert.equal(
    routeLead(rules, facts({ hasGst: true, emailType: null }), everyone),
    null,
  );
});

test("hasGst: false matches leads without a GSTIN", () => {
  const rules = [rule("nogst", { hasGst: false }, { memberId: "m1" })];
  assert.ok(routeLead(rules, facts({ hasGst: false }), everyone));
  assert.equal(routeLead(rules, facts({ hasGst: true }), everyone), null);
});

test("rulesProblem enforces the cap, unique ids, names and ranges", () => {
  const ok = rule("a", { scoreMin: 70 }, { roundRobin: true });
  assert.equal(rulesProblem([ok]), null);
  assert.ok(
    rulesProblem(
      Array.from({ length: 11 }, (_, i) =>
        rule(`r${i}`, {}, { roundRobin: true }),
      ),
    ),
  );
  assert.ok(rulesProblem([ok, ok]));
  assert.ok(rulesProblem([{ ...ok, name: "  " }]));
  assert.ok(rulesProblem([rule("b", { scoreMin: 0 }, { roundRobin: true })]));
  assert.ok(
    rulesProblem([rule("b", { scoreMin: 50.5 }, { roundRobin: true })]),
  );
  assert.ok(rulesProblem([rule("b", { source: " " }, { roundRobin: true })]));
});

test("parseRules tolerates missing or broken values", () => {
  assert.deepEqual(parseRules(null), []);
  assert.deepEqual(parseRules("nope"), []);
  assert.deepEqual(parseRules('{"a":1}'), []);
  assert.equal(parseRules('[{"id":"a"}]').length, 1);
});

test("describeCondition reads as a sentence", () => {
  assert.equal(describeCondition({}), "Any lead");
  assert.equal(
    describeCondition({ kind: "demo", scoreMin: 70, emailType: "company" }),
    "A demo request · hot (score 70+) · company email",
  );
  assert.equal(
    describeCondition({ hasGst: false, source: "calcom" }, () => "Cal.com"),
    "From Cal.com · without a GSTIN",
  );
});
