import assert from "node:assert/strict";
import { test } from "node:test";
import { addMoney, formatMoney, money, sumMoney } from "./money.ts";

const inr = (amount) => ({ amount, currency: "INR" });

test("INR uses Indian grouping in every runtime", () => {
  assert.equal(formatMoney(inr(0)), "₹0");
  assert.equal(formatMoney(inr(99_900)), "₹999");
  assert.equal(formatMoney(inr(1_00_000_00)), "₹1,00,000");
  assert.equal(formatMoney(inr(12_34_56_789_00)), "₹12,34,56,789");
  assert.equal(formatMoney(inr(-2_50_000_00)), "-₹2,50,000");
  assert.equal(formatMoney(inr(4_900), { fractions: true }), "₹49.00");
  assert.equal(
    formatMoney(inr(1_23_456_78), { fractions: true }),
    "₹1,23,456.78",
  );
  assert.equal(formatMoney(inr(5_049)), "₹50");
  assert.equal(formatMoney(inr(5_050)), "₹51");
});

test("converting to minor units has no float drift", () => {
  assert.deepEqual(money(1.005), inr(101));
  assert.deepEqual(money(0.1 + 0.2), inr(30));
  assert.deepEqual(money(19.99), inr(1999));
});

test("currencies are never added together", () => {
  assert.deepEqual(addMoney(inr(100), inr(250)), inr(350));
  assert.throws(() => addMoney(inr(100), { amount: 100, currency: "USD" }));
  assert.deepEqual(
    sumMoney([inr(100), { amount: 5, currency: "USD" }, inr(1)]),
    [inr(101), { amount: 5, currency: "USD" }],
  );
});
