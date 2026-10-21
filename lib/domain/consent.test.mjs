import assert from "node:assert/strict";
import { test } from "node:test";
import { decideContact, deriveChannel, deriveErasure } from "./consent.ts";

const at = (minutes) => Date.UTC(2026, 0, 1) + minutes * 60_000;
const row = (minutes, fields) => ({
  channel: "email",
  recordedAt: at(minutes),
  granted: fields.event === "grant",
  ...fields,
});
const decide = (rows, extra = {}) =>
  decideContact({
    rows,
    channel: "email",
    purpose: "sales_outreach",
    hasAddress: true,
    ...extra,
  });

test("denies by default and without an address", () => {
  assert.equal(decide([]).reason, "no_consent");
  assert.equal(decide([], { hasAddress: false }).reason, "no_address");
});

test("a grant allows its purpose only", () => {
  const rows = [
    row(1, { event: "grant", purpose: "product_updates", basis: "consent" }),
  ];
  assert.equal(decide(rows).allowed, false);
  assert.equal(decide(rows, { purpose: "product_updates" }).allowed, true);
});

test("a withdrawal without a purpose covers every purpose", () => {
  const rows = [
    row(1, { event: "grant", purpose: "sales_outreach", basis: "consent" }),
    row(2, { event: "withdraw" }),
  ];
  assert.equal(decide(rows).reason, "withdrawn");
  assert.equal(
    deriveChannel(rows, "email").purposes.product_updates.status,
    "withdrawn",
  );
});

test("legacy rows: a granted tick is consent to sales outreach", () => {
  const rows = [{ channel: "email", granted: true, recordedAt: at(1) }];
  assert.deepEqual(
    { allowed: decide(rows).allowed, basis: decide(rows).basis },
    { allowed: true, basis: "consent" },
  );
});

test("WhatsApp needs consent, not just a lawful basis", () => {
  const rows = [
    {
      ...row(1, {
        event: "grant",
        purpose: "sales_outreach",
        basis: "legitimate_interest",
      }),
      channel: "whatsapp",
    },
  ];
  const decision = decideContact({
    rows,
    channel: "whatsapp",
    purpose: "sales_outreach",
    hasAddress: true,
  });
  assert.equal(decision.reason, "opt_in_required");
});

test("DND blocks phone outreach until cleared", () => {
  const grant = {
    ...row(1, { event: "grant", purpose: "sales_outreach", basis: "consent" }),
    channel: "phone",
  };
  const on = { ...row(2, { event: "dnd_on" }), channel: "phone" };
  const off = { ...row(3, { event: "dnd_off" }), channel: "phone" };
  const phone = (rows) =>
    decideContact({
      rows,
      channel: "phone",
      purpose: "sales_outreach",
      hasAddress: true,
    });
  assert.equal(phone([grant, on]).reason, "dnd");
  assert.equal(phone([grant, on, off]).allowed, true);
});

test("erasure requests pause contact and erasure ends it", () => {
  const grant = row(1, {
    event: "grant",
    purpose: "sales_outreach",
    basis: "consent",
  });
  assert.equal(
    decide([grant, row(2, { event: "erasure_requested" })]).reason,
    "erasure_requested",
  );
  assert.equal(
    decide([
      grant,
      row(2, { event: "erasure_requested" }),
      row(3, { event: "erasure_cancelled" }),
    ]).allowed,
    true,
  );
  assert.equal(
    deriveErasure([grant, row(2, { event: "erased" })]).status,
    "erased",
  );
  assert.equal(decide([grant], { erasedAt: at(5) }).reason, "erased");
});
