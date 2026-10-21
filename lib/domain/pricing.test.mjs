// Run with `node --test lib/domain/pricing.test.mjs` (Node 22.18+ strips the types).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRate,
  approvalReasons,
  defaultPrice,
  marginBand,
  parsePercent,
  priceForMargin,
  priceLine,
  priceProposal,
} from "./pricing.ts";

const rupees = (value) => Math.round(value * 100);

test("research worked example at the default margin", () => {
  const line = priceLine({
    orderValue: rupees(1000),
    bonus: rupees(200),
    coupon: 0,
    slots: 350,
    orderFeeBps: 1000,
    bonusFeeBps: 3000,
  });
  // 1,200 ÷ 0.7 = 1,714.29 → rounded up to ₹1,715
  assert.equal(line.defaultPrice, rupees(1715));
  assert.equal(line.priceSet, false);
  assert.deepEqual(line.perSale, {
    brandCharge: rupees(1715),
    orderValue: rupees(1000),
    bonus: rupees(200),
    orderFee: rupees(100),
    bonusFee: rupees(60),
    fees: rupees(160),
    creatorPayout: rupees(1040),
    coupon: 0,
    margin: rupees(515),
    take: rupees(675),
  });
  assert.equal(line.total.brandCharge, rupees(600_250));
  assert.equal(line.total.take, rupees(236_250));
  assert.equal(line.total.margin, rupees(180_250));
  assert.ok(Math.abs(line.marginRate - 515 / 1715) < 1e-12);
  assert.equal(line.belowFloor, false);
});

test("Kesar Leaf: ₹212 bundled vs the ₹235 default", () => {
  const input = {
    orderValue: rupees(144.5),
    bonus: rupees(20),
    coupon: 0,
    slots: 350,
    orderFeeBps: 1000,
    bonusFeeBps: 3000,
  };
  // 164.50 ÷ 0.7 = 235 exactly, no rounding
  assert.equal(defaultPrice(input), rupees(235));
  const quoted = priceLine({ ...input, price: rupees(212) });
  assert.equal(quoted.perSale.margin, rupees(47.5));
  assert.equal(quoted.total.margin, rupees(16_625));
  assert.equal(quoted.total.brandCharge, rupees(74_200));
  assert.equal(Math.round(quoted.marginRate * 1000) / 10, 22.4);
  assert.equal(quoted.perSale.orderFee, 1445);
  assert.equal(quoted.perSale.bonusFee, rupees(6));
  assert.equal(quoted.perSale.take, 1445 + 600 + 4750);
  const atDefault = priceLine(input);
  assert.equal(
    atDefault.total.brandCharge - quoted.total.brandCharge,
    rupees(8050),
  );
});

test("coupon is funded from the margin, never by the brand", () => {
  const line = priceLine({
    orderValue: rupees(500),
    bonus: 0,
    coupon: rupees(50),
    slots: 10,
    orderFeeBps: 800,
    bonusFeeBps: 3000,
  });
  // 550 ÷ 0.7 = 785.71 → ₹786
  assert.equal(line.perSale.brandCharge, rupees(786));
  assert.equal(line.perSale.orderFee, rupees(40));
  assert.equal(line.perSale.creatorPayout, rupees(460));
  assert.equal(line.perSale.margin, rupees(236));
  assert.equal(line.perSale.take, rupees(276));
  assert.equal(
    line.perSale.take,
    line.perSale.brandCharge - line.perSale.creatorPayout - line.perSale.coupon,
  );
});

test("fees round half up to the paisa", () => {
  assert.equal(applyRate(99_999, 1250), 12_500); // 12,499.875
  assert.equal(applyRate(1, 5000), 1); // 0.5
  assert.equal(applyRate(1, 4999), 0);
  assert.equal(applyRate(0, 3000), 0);
});

test("default price rounds up to a whole unit", () => {
  assert.equal(priceForMargin(rupees(70), 3000), rupees(100));
  assert.equal(priceForMargin(rupees(70.01), 3000), rupees(101));
  assert.equal(priceForMargin(0, 3000), 0);
});

test("margin floor is 5%, inclusive", () => {
  const base = {
    orderValue: rupees(950),
    bonus: 0,
    coupon: 0,
    slots: 1,
    orderFeeBps: 1000,
    bonusFeeBps: 0,
  };
  const atFloor = priceLine({ ...base, price: rupees(1000) }); // 50 ÷ 1000 = 5%
  assert.equal(atFloor.belowFloor, false);
  const under = priceLine({ ...base, price: rupees(999.99) }); // 49.99 ÷ 999.99 = 4.999%
  assert.equal(under.belowFloor, true);
  const loss = priceLine({ ...base, price: rupees(900) });
  assert.equal(loss.perSale.margin, rupees(-50));
  assert.equal(loss.perSale.take, rupees(95 - 50));
  assert.equal(loss.belowFloor, true);
  assert.equal(marginBand(rupees(50), rupees(1000)), "low");
  assert.equal(marginBand(rupees(49), rupees(1000)), "below_floor");
  assert.equal(marginBand(rupees(200), rupees(1000)), "target");
  assert.equal(marginBand(rupees(300), rupees(1000)), "default");
});

test("approval: a line under the floor, or a blended margin under 15%", () => {
  const healthy = {
    orderValue: rupees(700),
    bonus: 0,
    coupon: 0,
    slots: 100,
    orderFeeBps: 1000,
    bonusFeeBps: 0,
  }; // ₹1,000 at 30%
  const thin = { ...healthy, slots: 300, price: rupees(778) }; // 78 ÷ 778 = 10.0%
  const blended = priceProposal([healthy, thin]);
  assert.equal(blended.belowFloorCount, 0);
  // (30,000 + 23,400) ÷ (1,00,000 + 2,33,400) = 16.0% → no approval
  assert.equal(blended.total.margin, rupees(53_400));
  assert.equal(blended.total.brandCharge, rupees(333_400));
  assert.equal(blended.needsApproval, false);

  const thinner = priceProposal([healthy, { ...thin, slots: 500 }]);
  // (30,000 + 39,000) ÷ (1,00,000 + 3,89,000) = 14.1%
  assert.equal(thinner.blendedBelowApproval, true);
  assert.equal(thinner.needsApproval, true);
  assert.deepEqual(approvalReasons(thinner), ["Blended margin is under 15%"]);

  const floor = priceProposal([
    { ...healthy, slots: 10_000 },
    { ...healthy, slots: 1, price: rupees(720) },
  ]);
  assert.equal(floor.blendedBelowApproval, false);
  assert.equal(floor.belowFloorCount, 1);
  assert.equal(floor.needsApproval, true);
  assert.deepEqual(approvalReasons(floor), [
    "1 line is below the 5% margin floor",
  ]);

  assert.equal(priceProposal([]).needsApproval, false);
});

test("percent input", () => {
  assert.equal(parsePercent("10"), 1000);
  assert.equal(parsePercent("12.5%"), 1250);
  assert.equal(parsePercent("0.05"), 5);
  assert.equal(parsePercent("100"), 10_000);
  assert.equal(parsePercent("100.01"), null);
  assert.equal(parsePercent("-1"), null);
  assert.equal(parsePercent("1.234"), null);
  assert.equal(parsePercent("abc"), null);
});
