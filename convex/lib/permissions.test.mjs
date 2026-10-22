import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PERMISSIONS,
  can,
  canAssignLead,
  canDecideApproval,
} from "./permissions.ts";

const rep = { _id: "rep", role: "rep" };
const otherRep = { _id: "rep2", role: "rep" };
const manager = { _id: "manager", role: "manager" };
const admin = { _id: "admin", role: "admin" };

// [action, rep on someone else's record, rep on their own, manager, admin]
const MATRIX = [
  ["record.read", true, true, true, true],
  ["record.create", true, true, true, true],
  ["record.edit", true, true, true, true],
  ["record.import", true, true, true, true],
  ["record.export", false, false, true, true],
  ["record.merge", false, false, true, true],
  ["record.restore", false, false, true, true],
  ["account.reassign", false, true, true, true],
  ["account.archive", false, true, true, true],
  ["person.reassign", false, true, true, true],
  ["person.archive", false, true, true, true],
  ["lead.reassign", false, true, true, true],
  ["deal.reassign", false, true, true, true],
  ["deal.delete", false, true, true, true],
  ["task.reassign", false, true, true, true],
  ["task.delete", false, true, true, true],
  ["activation.task", false, true, true, true],
  ["proposal.approve", false, false, true, true],
  ["activation.run", false, false, true, true],
  ["sequence.run", false, true, true, true],
  ["report.send", false, true, true, true],
  ["member.manage", false, false, false, true],
  ["invite.manage", false, false, false, true],
  ["settings.write", false, false, false, true],
  ["integrations.read", false, false, false, true],
  ["privacy.erase", false, false, false, true],
  ["privacy.retention", false, false, false, true],
];

test("the matrix covers every action", () => {
  assert.deepEqual(
    [...MATRIX.map(([action]) => action), "timeline.edit"].sort(),
    Object.keys(PERMISSIONS).sort(),
  );
});

for (const [action, repOther, repOwn, asManager, asAdmin] of MATRIX) {
  test(`${action}: rep ${repOther}/${repOwn}, manager ${asManager}, admin ${asAdmin}`, () => {
    assert.equal(can(rep, action, ["rep2"]), repOther);
    assert.equal(can(rep, action, ["rep"]), repOwn);
    assert.equal(can(manager, action, ["rep"]), asManager);
    assert.equal(can(admin, action, ["rep"]), asAdmin);
  });
}

test("timeline entries: the author or an admin, not a manager", () => {
  assert.equal(can(rep, "timeline.edit", ["rep"]), true);
  assert.equal(can(otherRep, "timeline.edit", ["rep"]), false);
  assert.equal(can(manager, "timeline.edit", ["rep"]), false);
  assert.equal(can(manager, "timeline.edit", ["manager"]), true);
  assert.equal(can(admin, "timeline.edit", ["rep"]), true);
});

test("an unowned record is nobody's own", () => {
  assert.equal(can(rep, "account.reassign", [undefined]), false);
  assert.equal(can(rep, "account.reassign", []), false);
});

test("reps claim unowned leads for themselves and hand on their own", () => {
  assert.equal(canAssignLead(rep, undefined, "rep"), true);
  assert.equal(canAssignLead(rep, undefined, "rep2"), false);
  assert.equal(canAssignLead(rep, "rep", "rep2"), true);
  assert.equal(canAssignLead(rep, "rep", null), true);
  assert.equal(canAssignLead(rep, "rep2", "rep"), false);
  assert.equal(canAssignLead(manager, "rep2", "rep"), true);
});

test("approvers can't decide their own request, unless admin", () => {
  assert.equal(canDecideApproval(rep, "rep2"), false);
  assert.equal(canDecideApproval(manager, "rep"), true);
  assert.equal(canDecideApproval(manager, "manager"), false);
  assert.equal(canDecideApproval(manager, undefined), true);
  assert.equal(canDecideApproval(admin, "admin"), true);
});
