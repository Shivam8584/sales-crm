import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CLOSE_SCORE,
  closeness,
  embedText,
  sharedWords,
} from "./aiEmbedText.ts";

const facts = {
  name: "Kesar Leaf",
  stage: "live",
  tags: ["tea", "d2c"],
  domain: "kesarleaf.com",
  about: ["Single-origin saffron tea from Kashmir."],
  platform: "live on the platform",
  marketplaces: ["Amazon", "Flipkart", "Amazon"],
  categories: ["Grocery"],
};

test("the embedded text carries business facts and no duplicates", () => {
  const text = embedText(facts);
  for (const part of [
    "Kesar Leaf",
    "Live",
    "kesarleaf.com",
    "tea, d2c",
    "Amazon, Flipkart",
    "Grocery",
    "saffron tea",
    "live on the platform",
  ]) {
    assert.ok(text.includes(part), part);
  }
  assert.equal(text.match(/Amazon/g).length, 1);
});

test("empty parts are left out and long text is cut", () => {
  const text = embedText({
    ...facts,
    tags: [],
    domain: null,
    about: ["x".repeat(5000)],
    marketplaces: [],
    categories: [],
  });
  assert.doesNotMatch(text, /Tags|Website|Sells on|Categories/);
  assert.ok(text.length <= 1600);
});

test("same input gives the same text", () => {
  assert.equal(embedText(facts), embedText({ ...facts }));
});

test("shared words name what two accounts have in common", () => {
  const other = {
    ...facts,
    stage: "funded",
    tags: ["D2C", "other"],
    categories: ["grocery"],
    marketplaces: [],
  };
  assert.deepEqual(sharedWords(facts, other), ["Grocery", "d2c"]);
  assert.deepEqual(
    sharedWords(facts, { ...other, tags: [], categories: [], stage: "live" }),
    ["Live"],
  );
});

test("scores bucket into close and similar", () => {
  assert.equal(closeness(CLOSE_SCORE), "close");
  assert.equal(closeness(CLOSE_SCORE - 0.01), "similar");
});
