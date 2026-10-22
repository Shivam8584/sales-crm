import test from "node:test";
import assert from "node:assert/strict";
import { fromLegacyPath, routes } from "./routes.ts";

test("legacy paths map onto the grouped routes", () => {
  assert.equal(fromLegacyPath("/leads"), "/pipeline/leads");
  assert.equal(fromLegacyPath("/deals/abc?tab=proposal"), "/pipeline/deals/abc?tab=proposal");
  assert.equal(fromLegacyPath("/automations/x1"), "/automation/sequences/x1");
  assert.equal(fromLegacyPath("/people?owner=mine"), "/records/people?owner=mine");
});

test("current and unrelated paths are left alone", () => {
  assert.equal(fromLegacyPath("/pipeline/leads/abc"), "/pipeline/leads/abc");
  assert.equal(fromLegacyPath("/today"), "/today");
  assert.equal(fromLegacyPath("/settings/team"), "/settings/team");
  assert.equal(fromLegacyPath("/leadsmith"), "/leadsmith");
});

test("builders", () => {
  assert.equal(routes.deal("d1", "proposal"), "/pipeline/deals/d1?tab=proposal");
  assert.equal(routes.sequence("s1"), "/automation/sequences/s1");
});
