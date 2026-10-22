import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AB_MIN_SAMPLE,
  compareVariants,
  describeComparison,
  hasVariantB,
  pickVariant,
  variantContent,
} from "./ab-test.ts";
import { validateAutomation } from "./automations.ts";

const ab = { subject: "Quick question", splitB: 50 };

test("a split test needs a real version B", () => {
  assert.equal(hasVariantB(undefined), false);
  assert.equal(hasVariantB({ splitB: 50 }), false);
  assert.equal(hasVariantB({ subject: "  ", body: "", splitB: 50 }), false);
  assert.equal(hasVariantB(ab), true);
});

test("version B falls back to A for what it leaves out", () => {
  const email = { subject: "Hello", body: "Body", ab };
  assert.deepEqual(variantContent(email, "a"), {
    subject: "Hello",
    body: "Body",
  });
  assert.deepEqual(variantContent(email, "b"), {
    subject: "Quick question",
    body: "Body",
  });
  assert.deepEqual(
    variantContent({ ...email, ab: { body: "New", splitB: 5 } }, "b"),
    {
      subject: "Hello",
      body: "New",
    },
  );
});

test("the same enrolment always gets the same version", () => {
  for (const seed of ["enr1:email", "enr2:email", "enr3:email"]) {
    assert.equal(pickVariant(ab, seed), pickVariant(ab, seed));
  }
  assert.equal(pickVariant(ab, "enr1:email", "a"), "a");
  assert.equal(pickVariant(ab, "enr1:email", "b"), "b");
});

test("the split is roughly honoured across many enrolments", () => {
  const share = (splitB) => {
    let b = 0;
    for (let index = 0; index < 4000; index++) {
      if (pickVariant({ ...ab, splitB }, `enrolment${index}:email`) === "b")
        b++;
    }
    return b / 4000;
  };
  assert.ok(Math.abs(share(50) - 0.5) < 0.05);
  assert.ok(Math.abs(share(20) - 0.2) < 0.05);
});

test("0 and 100 are declared winners, even for earlier assignments", () => {
  assert.equal(pickVariant({ ...ab, splitB: 0 }, "x", "b"), "a");
  assert.equal(pickVariant({ ...ab, splitB: 100 }, "x", "a"), "b");
  assert.equal(pickVariant({ splitB: 100 }, "x"), "a");
  assert.equal(pickVariant(undefined, "x", "b"), "a");
});

test("results under the minimum sample are too early to call", () => {
  const few = { sent: AB_MIN_SAMPLE - 1, replied: 10 };
  const many = { sent: 500, replied: 0 };
  assert.deepEqual(compareVariants(few, many), {
    state: "too_early",
    need: AB_MIN_SAMPLE,
  });
  assert.match(describeComparison(few, many), /^Too early to call/);
  assert.equal(
    compareVariants({ sent: 0, replied: 0 }, many).state,
    "too_early",
  );
});

test("with enough sends the comparison is counts, not significance", () => {
  const a = { sent: 100, replied: 10 };
  assert.deepEqual(compareVariants(a, { sent: 100, replied: 19 }), {
    state: "ahead",
    leader: "b",
    points: 9,
  });
  assert.deepEqual(compareVariants({ sent: 100, replied: 20 }, a), {
    state: "ahead",
    leader: "a",
    points: 10,
  });
  assert.deepEqual(compareVariants(a, { sent: 100, replied: 11 }), {
    state: "even",
  });
  assert.match(
    describeComparison(a, { sent: 100, replied: 19 }),
    /B is ahead by 9 points/,
  );
});

const draft = (config) => ({
  subjectKind: "person",
  trigger: { kind: "manual" },
  graph: {
    nodes: [
      { id: "t", kind: "trigger", x: 0, y: 0, config: {} },
      {
        id: "e",
        kind: "send_email",
        x: 0,
        y: 100,
        config: {
          subject: "Hello",
          body: "Hi there",
          purpose: "sales_outreach",
          ...config,
        },
      },
    ],
    edges: [{ id: "1", source: "t", port: "out", target: "e" }],
  },
  settings: {
    dailyCap: 50,
    quietHours: false,
    stopOnReply: true,
    goal: [],
    allowReenroll: false,
  },
});

const fields = (config) =>
  validateAutomation(draft(config), {
    members: new Set(),
    automations: new Set(),
  })
    .filter((issue) => issue.nodeId === "e")
    .map((issue) => issue.field);

test("the editor flags a split test that cannot work", () => {
  assert.deepEqual(fields({}), []);
  assert.deepEqual(fields({ ab: { subject: "Other", splitB: 50 } }), []);
  assert.deepEqual(fields({ ab: { splitB: 50 } }), ["abSubject"]);
  assert.deepEqual(fields({ ab: { subject: "Hello", splitB: 50 } }), [
    "abSubject",
  ]);
  assert.deepEqual(fields({ ab: { subject: "Other", splitB: 101 } }), [
    "abSplit",
  ]);
  assert.deepEqual(fields({ ab: { subject: "Other", splitB: 2.5 } }), [
    "abSplit",
  ]);
  assert.deepEqual(
    fields({ ab: { subject: "Hi {{nope.unknown}}", splitB: 50 } }),
    ["abBody"],
  );
});
