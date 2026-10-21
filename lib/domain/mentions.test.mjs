import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeMention,
  addedMentions,
  bodyText,
  decodeMentions,
  encodeMentions,
  insertMention,
  matchesMention,
  mentionIds,
  parseBody,
} from "./mentions.ts";

const ravi = { id: "j57ravi", name: "Ravi" };
const raviKumar = { id: "j57ravikumar", name: "Ravi Kumar" };
const names = { j57ravi: "Ravi", j57ravikumar: "Ravi Kumar" };
const nameOf = (id) => names[id];

test("parses tokens into text and mention segments", () => {
  assert.deepEqual(parseBody("Hi <@j57ravi>, call <@abc1> today"), [
    { type: "text", text: "Hi " },
    { type: "mention", id: "j57ravi" },
    { type: "text", text: ", call " },
    { type: "mention", id: "abc1" },
    { type: "text", text: " today" },
  ]);
  assert.deepEqual(parseBody("<@a1>"), [{ type: "mention", id: "a1" }]);
  assert.deepEqual(parseBody("no mentions"), [
    { type: "text", text: "no mentions" },
  ]);
  assert.deepEqual(parseBody("<@Not-An-Id>"), [
    { type: "text", text: "<@Not-An-Id>" },
  ]);
});

test("lists distinct mentioned ids in order", () => {
  assert.deepEqual(mentionIds("<@b2> and <@a1> and <@b2>"), ["b2", "a1"]);
  assert.deepEqual(mentionIds(undefined), []);
});

test("finds only newly added mentions", () => {
  assert.deepEqual(addedMentions(["a", "b"], ["b", "c", "a", "d"]), ["c", "d"]);
  assert.deepEqual(addedMentions(["a"], []), []);
});

test("encodes picked names, longest first, never inside emails", () => {
  assert.equal(
    encodeMentions("@Ravi Kumar and @Ravi, cc ravi@hypedrive.in", [
      ravi,
      raviKumar,
    ]),
    "<@j57ravikumar> and <@j57ravi>, cc ravi@hypedrive.in",
  );
  assert.equal(encodeMentions("(@ravi)", [ravi]), "(<@j57ravi>)");
  assert.equal(encodeMentions("@Ravikiran", [ravi]), "@Ravikiran");
  assert.equal(encodeMentions("@Priya hi", [ravi]), "@Priya hi");
  assert.equal(encodeMentions("text", []), "text");
});

test("decodes tokens back to editable text and round-trips", () => {
  const body = "<@j57ravikumar> please ping <@j57ravi> and <@gone1>";
  const { text, picks } = decodeMentions(body, nameOf);
  assert.equal(text, "@Ravi Kumar please ping @Ravi and <@gone1>");
  assert.deepEqual(picks, [raviKumar, ravi]);
  assert.equal(encodeMentions(text, picks), body);
  assert.equal(
    bodyText(body, nameOf),
    "@Ravi Kumar please ping @Ravi and @someone",
  );
});

test("detects the query being typed before the caret", () => {
  assert.deepEqual(activeMention("Hi @ra", 6), { start: 3, query: "ra" });
  assert.deepEqual(activeMention("@", 1), { start: 0, query: "" });
  assert.deepEqual(activeMention("ask @Ravi K", 11), {
    start: 4,
    query: "Ravi K",
  });
  assert.equal(activeMention("mail ravi@hyp", 13), null);
  assert.equal(activeMention("@ravi kumar now", 15), null);
  assert.equal(activeMention("@ ravi", 6), null);
  assert.equal(activeMention("@ra\nx", 5), null);
  assert.equal(activeMention("no at sign", 5), null);
  assert.deepEqual(activeMention("@ra and more", 3), { start: 0, query: "ra" });
});

test("matches members by any name word or email", () => {
  const member = { name: "Ravi Kumar", email: "rk@example.com" };
  assert.equal(matchesMention(member, ""), true);
  assert.equal(matchesMention(member, "ku"), true);
  assert.equal(matchesMention(member, "Ravi K"), true);
  assert.equal(matchesMention(member, "rk@"), true);
  assert.equal(matchesMention(member, "avi"), false);
});

test("inserts the chosen name and places the caret after it", () => {
  assert.deepEqual(insertMention("Hi @ra", { start: 3, end: 6 }, "Ravi"), {
    text: "Hi @Ravi ",
    caret: 9,
  });
  assert.deepEqual(
    insertMention("@ra there", { start: 0, end: 3 }, "Ravi Kumar"),
    { text: "@Ravi Kumar there", caret: 12 },
  );
});
