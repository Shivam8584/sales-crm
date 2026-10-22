import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanComment,
  followUp,
  isScore,
  isSurveyToken,
  newSurveyToken,
  npsOf,
  scoreBucket,
} from "./surveys.ts";
import {
  DEFAULT_SETTINGS,
  VARIABLE,
  renderTemplate,
  templateIssues,
  validateAutomation,
} from "./automations.ts";

test("scores bucket into promoter, passive and detractor", () => {
  assert.equal(scoreBucket(10), "promoter");
  assert.equal(scoreBucket(9), "promoter");
  assert.equal(scoreBucket(8), "passive");
  assert.equal(scoreBucket(7), "passive");
  assert.equal(scoreBucket(6), "detractor");
  assert.equal(scoreBucket(0), "detractor");
});

test("only whole numbers from 0 to 10 are scores", () => {
  for (const ok of [0, 5, 10]) assert.ok(isScore(ok));
  for (const bad of [-1, 11, 7.5, "9", null, NaN]) assert.ok(!isScore(bad));
});

test("NPS is percent promoters minus percent detractors", () => {
  assert.equal(npsOf([]).nps, null);
  assert.deepEqual(npsOf([10, 9, 8, 3]), {
    total: 4,
    promoter: 2,
    passive: 1,
    detractor: 1,
    nps: 25,
  });
  assert.equal(npsOf([0, 1, 2]).nps, -100);
  assert.equal(npsOf([9, 10]).nps, 100);
  assert.equal(npsOf([7, 8, 7]).nps, 0);
  assert.equal(npsOf([10, 6, 6]).nps, -33);
});

test("tokens are 43 unguessable base64url characters", () => {
  const tokens = new Set(Array.from({ length: 50 }, newSurveyToken));
  assert.equal(tokens.size, 50);
  for (const token of tokens) assert.ok(isSurveyToken(token), token);
  assert.ok(!isSurveyToken("short"));
  assert.ok(!isSurveyToken(`${newSurveyToken()}=`));
  assert.ok(!isSurveyToken(`${newSurveyToken().slice(1)}/`));
  assert.ok(!isSurveyToken(undefined));
});

test("comments lose control characters and surrounding space", () => {
  assert.equal(cleanComment("  great\u0000 work\u0007  "), "great work");
  assert.equal(cleanComment("a\r\nb\u2028c"), "a\nbc");
  assert.equal(cleanComment(" \n\t "), undefined);
});

test("promoters get a referral ask and detractors a rescue", () => {
  assert.deepEqual(followUp(9, "Kesar"), {
    title: "Ask Kesar for a referral",
    priority: "normal",
    dueInDays: 2,
  });
  assert.deepEqual(followUp(3, "Kesar"), {
    title: "Rescue: Kesar gave NPS 3",
    priority: "high",
    dueInDays: 0,
  });
  assert.equal(followUp(8, "Kesar"), null);
});

test("{{survey.link}} validates for people, accounts and leads but not deals", () => {
  const text = "Tell us how we did: {{survey.link}}";
  for (const kind of ["person", "account", "lead"]) {
    assert.deepEqual(templateIssues(text, kind), []);
  }
  assert.equal(templateIssues(text, "deal").length, 1);
  const link = "https://sales.hypedrive.app/survey/abc";
  assert.equal(
    renderTemplate(text, { "survey.link": link }).text,
    `Tell us how we did: ${link}`,
  );
  assert.deepEqual(renderTemplate(text, {}).missing, ["survey.link"]);
  assert.match(VARIABLE.get("survey.link").example, /\/survey\/preview$/);
});

test("a sequence that mails the survey link is valid for people and not for deals", () => {
  const graph = {
    nodes: [
      { id: "t", kind: "trigger", x: 0, y: 0, config: {} },
      {
        id: "e",
        kind: "send_email",
        x: 0,
        y: 0,
        config: {
          subject: "How are we doing?",
          body: "Hi {{person.firstName}}, two clicks: {{survey.link}}",
          purpose: "product_updates",
        },
      },
    ],
    edges: [{ id: "t-out-e", source: "t", port: "out", target: "e" }],
  };
  const draft = (subjectKind) => ({
    subjectKind,
    trigger: { kind: "manual" },
    graph,
    settings: DEFAULT_SETTINGS,
  });
  assert.deepEqual(validateAutomation(draft("person")), []);
  assert.deepEqual(validateAutomation(draft("account")), []);
  assert.ok(validateAutomation(draft("deal")).length > 0);
});
