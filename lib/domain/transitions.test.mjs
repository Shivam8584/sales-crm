import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dealStageEffects,
  isLeadReopen,
  leadConvertProblem,
  leadStatusProblem,
  proposalMoveProblem,
  taskCompletedAt,
} from "./transitions.ts";

test("converted leads are terminal and only Convert gets there", () => {
  for (const to of [
    "new",
    "contacted",
    "qualified",
    "nurture",
    "disqualified",
  ]) {
    assert.equal(leadStatusProblem("converted", to, "spam")?.field, "status");
  }
  assert.equal(leadStatusProblem("new", "converted")?.field, "status");
  assert.equal(leadConvertProblem("converted")?.field, "status");
});

test("disqualifying needs a reason; reopening a disqualified lead is allowed", () => {
  assert.equal(leadStatusProblem("new", "disqualified")?.field, "reason");
  assert.equal(leadStatusProblem("new", "disqualified", "spam"), null);
  assert.equal(leadStatusProblem("disqualified", "contacted"), null);
  assert.equal(isLeadReopen("disqualified", "new"), true);
  assert.equal(isLeadReopen("contacted", "qualified"), false);
  assert.equal(leadConvertProblem("disqualified")?.field, "status");
  assert.equal(leadConvertProblem("qualified"), null);
});

test("moving between open lead statuses, including back to new for undo, is fine", () => {
  assert.equal(leadStatusProblem("contacted", "new"), null);
  assert.equal(leadStatusProblem("nurture", "qualified"), null);
});

test("won and lost stamp closedAt; reopening clears it and the reason", () => {
  const now = 1_000;
  const won = dealStageEffects({ stage: "proposal" }, "won", undefined, now);
  assert.deepEqual(won, { ok: true, closedAt: now, lostReason: undefined });
  const stays = dealStageEffects(
    { stage: "won", closedAt: 500 },
    "won",
    undefined,
    now,
  );
  assert.equal(stays.ok && stays.closedAt, 500);
  const reopened = dealStageEffects(
    { stage: "lost", closedAt: 500 },
    "discovery",
    "budget",
    now,
  );
  assert.deepEqual(reopened, {
    ok: true,
    closedAt: undefined,
    lostReason: undefined,
  });
  const lost = dealStageEffects(
    { stage: "won", closedAt: 500 },
    "lost",
    "x",
    now,
  );
  assert.deepEqual(lost, { ok: true, closedAt: now, lostReason: "x" });
});

test("lost needs a reason", () => {
  const result = dealStageEffects({ stage: "demo" }, "lost", undefined, 1);
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.problem.field, "lostReason");
});

test("completedAt follows the task status", () => {
  assert.equal(taskCompletedAt("todo", "done", undefined, 9), 9);
  assert.equal(taskCompletedAt("done", "done", 5, 9), 5);
  assert.equal(taskCompletedAt("done", "done", undefined, 9), 9);
  assert.equal(taskCompletedAt("done", "todo", 5, 9), undefined);
  assert.equal(taskCompletedAt("todo", "in_progress", 5, 9), undefined);
  assert.equal(taskCompletedAt(null, "done", undefined, 9), 9);
});

test("proposals go draft → sent → accepted/rejected, and decisions reopen to sent", () => {
  assert.equal(proposalMoveProblem("draft", "sent"), null);
  assert.equal(proposalMoveProblem("sent", "accepted"), null);
  assert.equal(proposalMoveProblem("sent", "rejected"), null);
  assert.equal(proposalMoveProblem("accepted", "sent"), null);
  assert.equal(proposalMoveProblem("rejected", "sent"), null);
  assert.notEqual(proposalMoveProblem("draft", "accepted"), null);
  assert.notEqual(proposalMoveProblem("sent", "draft"), null);
  assert.notEqual(proposalMoveProblem("accepted", "rejected"), null);
  assert.notEqual(proposalMoveProblem("sent", "sent"), null);
});
