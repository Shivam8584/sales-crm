import assert from "node:assert/strict";
import { test } from "node:test";
import { routes } from "./../routes.ts";
import {
  SLACK_EVENTS,
  escapeSlack,
  isSlackEvent,
  normalizeChannel,
  redactBlocks,
  redactContacts,
  slackEventMessage,
} from "./slack.ts";

test("events are unique and recognised by id", () => {
  const ids = SLACK_EVENTS.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(isSlackEvent("deal_won"));
  assert.ok(!isSlackEvent("deal_deleted"));
});

test("channels are normalised to an ID or #name", () => {
  assert.deepEqual(normalizeChannel(" #Sales "), { ok: true, value: "#sales" });
  assert.deepEqual(normalizeChannel("sales-eu"), {
    ok: true,
    value: "#sales-eu",
  });
  assert.deepEqual(normalizeChannel("C0123ABCD45"), {
    ok: true,
    value: "C0123ABCD45",
  });
  for (const bad of ["two words", "#", "", "@here", "#" + "a".repeat(81)]) {
    assert.equal(normalizeChannel(bad).ok, false, bad);
  }
});

test("markup characters are escaped so a name can't inject mentions or links", () => {
  assert.equal(
    escapeSlack("<!channel> & <b>"),
    "&lt;!channel&gt; &amp; &lt;b&gt;",
  );
  const { text, blocks } = slackEventMessage(
    "lead_hot",
    {
      name: "<!here> Asha",
      detail: "Acme & Co · score 82",
      path: routes.lead("abc"),
    },
    "https://crm.example",
  );
  assert.equal(text, "New hot lead: <!here> Asha");
  assert.equal(
    blocks[0].text.text,
    `*New hot lead* <https://crm.example${routes.lead("abc")}|&lt;!here&gt; Asha>\nAcme &amp; Co · score 82`,
  );
});

test("email addresses and phone numbers are masked, dates and amounts are not", () => {
  assert.equal(
    redactContacts(
      "Mail asha.k+crm@brand.co.in or call +91 98765 43210 / (022) 4000-1234",
    ),
    "Mail [email hidden] or call [phone hidden] / [phone hidden]",
  );
  assert.equal(
    redactContacts("Closed 2026-10-23 for ₹12,50,000 in 14 days"),
    "Closed 2026-10-23 for ₹12,50,000 in 14 days",
  );
});

test("masking reaches nested block text but leaves links and types alone", () => {
  const url = `https://crm.example${routes.lead("k1722334455667788")}`;
  const blocks = redactBlocks([
    {
      type: "section",
      text: { type: "mrkdwn", text: `<${url}|Asha> asha@brand.in` },
      accessory: { type: "button", url },
    },
  ]);
  assert.equal(blocks[0].text.text, `<${url}|Asha> [email hidden]`);
  assert.equal(blocks[0].accessory.url, url);
  assert.equal(blocks[0].type, "section");
});
