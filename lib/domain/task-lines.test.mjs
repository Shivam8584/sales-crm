import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_TASK_LINES,
  MAX_TASK_TITLE,
  parseTaskLines,
} from "./task-lines.ts";

// Thursday.
const TODAY = "2026-10-22";
const parse = (text) => parseTaskLines(text, TODAY);
const one = (text) => parse(text).tasks[0];

test("skips blank lines but keeps source line numbers", () => {
  const { tasks } = parse("\n  \nCall Priya\n\r\n\nSend deck\n");
  assert.deepEqual(
    tasks.map((task) => [task.line, task.title]),
    [
      [3, "Call Priya"],
      [6, "Send deck"],
    ],
  );
});

test("strips bullets and numbering", () => {
  const titles = parse(
    "- one\n* two\n1. three\n12) four\n• five\n-\n",
  ).tasks.map((task) => task.title);
  assert.deepEqual(titles, ["one", "two", "three", "four", "five"]);
});

test("leaves leading hyphens and years that are not bullets", () => {
  assert.equal(one("-5% discount").title, "-5% discount");
  assert.equal(one("2026 plan").title, "2026 plan");
});

test("reads priority and relative due dates from the end", () => {
  const task = one("Call Priya !high @tomorrow");
  assert.equal(task.title, "Call Priya");
  assert.equal(task.priority, "high");
  assert.equal(task.dueDate, "2026-10-23");
  assert.equal(task.error, null);
});

test("token order does not matter and is case-insensitive", () => {
  const task = one("Send deck @Today !URGENT");
  assert.equal(task.title, "Send deck");
  assert.equal(task.priority, "urgent");
  assert.equal(task.dueDate, TODAY);
});

test("weekdays mean the next such day, never today", () => {
  assert.equal(one("a @fri").dueDate, "2026-10-23");
  assert.equal(one("a @thu").dueDate, "2026-10-29");
  assert.equal(one("a @mon").dueDate, "2026-10-26");
  assert.equal(one("a @sun").dueDate, "2026-10-25");
});

test("accepts an explicit date", () => {
  assert.equal(one("a @2027-01-05").dueDate, "2027-01-05");
});

test("flags impossible dates and keeps the title", () => {
  const task = one("File GST @2026-02-30");
  assert.equal(task.title, "File GST");
  assert.equal(task.dueDate, null);
  assert.match(task.error, /2026-02-30/);
});

test("tokens in the middle of a line stay in the title", () => {
  const task = one("Email @tomorrow about !high stakes");
  assert.equal(task.title, "Email @tomorrow about !high stakes");
  assert.equal(task.priority, null);
  assert.equal(task.dueDate, null);
});

test("unknown tokens stay in the title", () => {
  assert.equal(one("Ping @priya").title, "Ping @priya");
  assert.equal(one("Fix !bug").title, "Fix !bug");
  assert.equal(one("Fix !bug @fri").title, "Fix !bug");
});

test("a repeated token of the same kind stays in the title", () => {
  const task = one("Plan !low !high");
  assert.equal(task.priority, "high");
  assert.equal(task.title, "Plan !low");
});

test("a line of only tokens has no title", () => {
  const task = one("!high @today");
  assert.equal(task.title, "");
  assert.equal(task.error, "Add a title");
});

test("collapses whitespace and caps the title length", () => {
  assert.equal(one("  a    b \t c  ").title, "a b c");
  assert.equal(one("x".repeat(500)).title.length, MAX_TASK_TITLE);
});

test("reports lines beyond the limit instead of parsing them", () => {
  const text = Array.from({ length: MAX_TASK_LINES + 7 }, (_, i) => `t${i}`);
  const { tasks, overflow } = parse(text.join("\n"));
  assert.equal(tasks.length, MAX_TASK_LINES);
  assert.equal(overflow, 7);
});
