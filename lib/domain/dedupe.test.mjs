import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountReasons,
  domainKey,
  gstinKey,
  groupPairs,
  movedPhrase,
  nameKey,
  pairKeys,
  panKey,
  personReasons,
  similarity,
} from "./dedupe.ts";

const codes = (reasons) => reasons.map((reason) => reason.code);

test("nameKey drops case, punctuation and trailing legal words", () => {
  for (const name of [
    "Acme",
    "ACME Pvt. Ltd.",
    "Acme Private Limited",
    "acme india pvt ltd",
    "Acme (P) Ltd",
    "Acme Co.",
    "  Acme   Company ",
  ]) {
    assert.equal(nameKey(name), "acme", name);
  }
  assert.equal(nameKey("Johnson & Johnson Inc"), "johnson and johnson");
  assert.equal(nameKey("India Mart Pvt Ltd"), "india mart");
});

test("a name made only of legal words keeps them", () => {
  assert.equal(nameKey("Pvt Ltd"), "pvt");
  assert.equal(nameKey("Limited"), "limited");
  assert.equal(nameKey(""), "");
});

test("keys normalise websites, GSTINs, PANs", () => {
  assert.equal(domainKey("https://www.Acme.in/about"), "acme.in");
  assert.equal(domainKey("gmail.com"), null);
  assert.equal(domainKey(undefined), null);
  assert.equal(gstinKey(" 29-aaaci4798l1zu "), "29AAACI4798L1ZU");
  assert.equal(gstinKey("29AAACI"), null);
  assert.equal(panKey("29AAACI4798L1ZU"), "AAACI4798L");
  assert.equal(panKey(undefined), null);
});

test("similarity is bounded and symmetric", () => {
  assert.equal(similarity("acme traders", "acme traders"), 1);
  assert.ok(similarity("sharma enterprises", "sharma enterprise") >= 0.85);
  assert.ok(similarity("sharma enterprises", "sharmaa enterprises") >= 0.85);
  assert.equal(similarity("acme traders", "zenith labs"), 0);
  assert.equal(similarity("abc", "abd"), 0);
  assert.equal(
    similarity("kumar textiles", "kumar textile"),
    similarity("kumar textile", "kumar textiles"),
  );
  assert.equal(similarity("", ""), 0);
});

test("accounts: GSTIN and platform org are certain, website and name strong", () => {
  const base = { name: "Acme Pvt Ltd" };
  assert.deepEqual(
    codes(
      accountReasons(
        { ...base, gstin: "29AAACI4798L1ZU" },
        { name: "Other", gstin: "29aaaci4798l1zu" },
      ),
    ),
    ["gstin"],
  );
  assert.deepEqual(
    codes(
      accountReasons(
        { name: "A", platformOrgId: "org_1" },
        { name: "B", platformOrgId: "org_1" },
      ),
    ),
    ["platform"],
  );
  const both = accountReasons(
    { name: "Acme Pvt Ltd", domain: "acme.in" },
    { name: "ACME Limited", domain: "www.acme.in" },
  );
  assert.deepEqual(codes(both), ["domain", "name"]);
  assert.ok(both.every((reason) => reason.strength === "strong"));
});

test("accounts: similar names are medium, unrelated ones are nothing", () => {
  const similar = accountReasons(
    { name: "Sharma Enterprises Pvt Ltd" },
    { name: "Sharma Enterprise" },
  );
  assert.deepEqual(codes(similar), ["similar"]);
  assert.equal(similar[0].label, "Similar name");
  assert.equal(similar[0].strength, "medium");
  assert.deepEqual(
    accountReasons({ name: "Acme" }, { name: "Zenith Labs" }),
    [],
  );
});

test("accounts: another branch of the same PAN is only a medium signal", () => {
  const reasons = accountReasons(
    { name: "Acme North", gstin: "29AAACI4798L1ZU" },
    { name: "Acme South", gstin: "27AAACI4798L1Z8" },
  );
  assert.deepEqual(codes(reasons), ["pan"]);
});

test("accounts: shared hosts and empty values never match", () => {
  assert.deepEqual(
    accountReasons(
      { name: "A", domain: "gmail.com" },
      { name: "B", domain: "gmail.com" },
    ),
    [],
  );
  assert.deepEqual(accountReasons({ name: "A" }, { name: "B" }), []);
});

test("people: email is certain, phone strong, name only at the same account", () => {
  const a = {
    firstName: "Asha",
    lastName: "Rao",
    email: "Asha@Acme.in",
    phone: "98200 12345",
    accountId: "acc1",
  };
  assert.deepEqual(
    codes(
      personReasons(a, {
        firstName: "A.",
        lastName: "R.",
        email: "asha@acme.in",
        phone: "+919820012345",
        accountId: "acc2",
      }),
    ),
    ["email", "phone"],
  );
  assert.deepEqual(
    codes(
      personReasons(a, {
        firstName: "asha",
        lastName: "RAO",
        accountId: "acc1",
      }),
    ),
    ["personName"],
  );
  assert.deepEqual(
    personReasons(a, { firstName: "Asha", lastName: "Rao", accountId: "acc2" }),
    [],
  );
  assert.deepEqual(
    personReasons(
      { firstName: "Asha", lastName: "Rao" },
      { firstName: "Asha", lastName: "Rao" },
    ),
    [],
  );
});

test("people: platform user is certain", () => {
  const reasons = personReasons(
    { firstName: "A", lastName: "", platformUserId: "u1" },
    { firstName: "B", lastName: "", platformUserId: "u1" },
  );
  assert.deepEqual(codes(reasons), ["platformUser"]);
  assert.equal(reasons[0].strength, "certain");
});

test("pairKeys is order independent", () => {
  assert.deepEqual(pairKeys("b", "a"), ["a", "b"]);
  assert.deepEqual(pairKeys("a", "b"), ["a", "b"]);
});

test("groupPairs joins shared records and ranks the strongest group first", () => {
  const weak = [{ code: "similar", label: "Similar name", strength: "medium" }];
  const strong = [{ code: "gstin", label: "Same GSTIN", strength: "certain" }];
  const groups = groupPairs([
    { a: "1", b: "2", reasons: weak },
    { a: "2", b: "3", reasons: weak },
    { a: "8", b: "9", reasons: strong },
  ]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].ids, ["8", "9"]);
  assert.deepEqual(groups[1].ids.sort(), ["1", "2", "3"]);
  assert.equal(groups[1].pairs.length, 2);
  assert.deepEqual(groupPairs([]), []);
});

test("movedPhrase lists what moves and skips zeros", () => {
  assert.equal(
    movedPhrase({ people: 3, deals: 2, tasks: 11, timeline: 40, leads: 0 }),
    "3 people, 2 deals, 11 tasks and the timeline",
  );
  assert.equal(movedPhrase({ people: 1 }), "1 person");
  assert.equal(
    movedPhrase({ deals: 1, timeline: 2 }),
    "1 deal and the timeline",
  );
  assert.equal(movedPhrase({}), "nothing");
  assert.equal(movedPhrase({ tasks: 500 }, 500), "500+ tasks");
});
