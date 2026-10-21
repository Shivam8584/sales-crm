// Run with `npm test`; every expected number below is worked out by hand.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_POLICY,
  applyRate,
  approvalPayload,
  approvalReasons,
  blankLine,
  freezeLines,
  lineProblem,
  marginBand,
  orderPoolProblem,
  parseFactor,
  parsePercent,
  patchLine,
  policyProblem,
  priceForMargin,
  priceLine,
  priceLines,
} from "./pricing.ts";

const rupees = (value) => ({
  amount: Math.round(value * 100),
  currency: "INR",
});
const paise = (value) => Math.round(value * 100);

function online(overrides = {}) {
  return {
    key: "a",
    product: "Earbuds",
    marketplace: "amazon",
    archetype: "online_purchase",
    order: { value: rupees(1000), fundBps: 6000, feeBps: 1000 },
    bonus: rupees(200),
    bonusFeeBps: 3000,
    coupon: { kind: "none" },
    slots: 100,
    slotMode: "lines",
    expiryDays: 45,
    oversubscribe: 150,
    presentation: "bundled",
    ...overrides,
  };
}

function checkin(bonus, overrides = {}) {
  return {
    ...online(),
    archetype: "checkin",
    order: undefined,
    bonus: rupees(bonus),
    bonusFeeBps: 0,
    ...overrides,
  };
}

test("online purchase at the default margin", () => {
  const line = priceLine(online(), DEFAULT_POLICY);
  // order_gross 600, fee 100, bonus_fee 60; cost 800 ÷ 0.7 = 1,142.86 → ₹1,143
  assert.equal(line.defaultPrice, paise(1143));
  assert.equal(line.priceSet, false);
  assert.deepEqual(line.perEnrollment, {
    brandCharge: paise(1143),
    billed: paise(1143),
    tax: 20574, // 1,143 × 18% = 205.74
    orderValue: paise(1000),
    orderGross: paise(600),
    orderFee: paise(100),
    orderNet: paise(500),
    bonus: paise(200),
    bonusFee: paise(60),
    bonusNet: paise(140),
    productCost: 0,
    couponNet: 0,
    commission: 0,
    creatorNet: paise(640),
    platformFee: paise(160),
    markup: paise(343),
    margin: paise(343),
    take: paise(503),
  });
  // take is what's left of the bill after the creator is paid
  assert.equal(
    line.perEnrollment.take,
    line.perEnrollment.billed - line.perEnrollment.creatorNet,
  );
  assert.equal(line.total.billed, paise(114_300));
  assert.equal(line.total.take, paise(50_300));
  assert.equal(line.total.tax, paise(20_574));
  assert.equal(line.maxEnrollments, 150);
  assert.equal(line.belowFloor, false);
  assert.deepEqual(line.issues, []);
  // markup rides in the bonus pool: 200 + 343, cut ⌈(60 + 343) ÷ 543⌉ = 74.22%
  assert.deepEqual(line.platform.input, {
    order: { fund: "0.6000", platform_cut: "0.1000" },
    bonus: { amount_paise: 54_300, platform_cut: "0.7422" },
  });
  // the platform's own maths lands within a paisa of the quote: 100 + 403.01
  assert.equal(line.platform.platformFee, 50_301);
  assert.equal(line.platform.floor, 0);
});

test("barter: product cost is shipped by the brand, never billed", () => {
  const line = priceLine(
    {
      ...online(),
      archetype: "barter",
      order: undefined,
      productCost: rupees(1000),
    },
    DEFAULT_POLICY,
  );
  // cost 200 + 1,000 = 1,200 ÷ 0.7 = 1,714.29 → ₹1,715 all-in
  const p = line.perEnrollment;
  assert.equal(p.brandCharge, paise(1715));
  assert.equal(p.billed, paise(715));
  assert.equal(p.tax, paise(128.7));
  assert.equal(p.orderGross, 0);
  assert.equal(p.markup, paise(515));
  assert.equal(p.margin, paise(515));
  assert.equal(p.platformFee, paise(60));
  assert.equal(p.take, paise(575));
  assert.equal(p.creatorNet, paise(140));
  assert.deepEqual(line.platform.input, {
    bonus: { amount_paise: 71_500, platform_cut: "0.8042" },
    product: { cost_paise: 100_000 },
  });
  assert.equal(line.platform.platformFee, paise(575));
  assert.deepEqual(line.issues, []);
});

test("barter rules: no order pool, no coupon; product cost only on barter", () => {
  const barter = {
    ...online(),
    archetype: "barter",
    order: undefined,
    productCost: rupees(500),
  };
  assert.equal(lineProblem(barter), null);
  assert.equal(
    lineProblem({ ...barter, order: online().order }).field,
    "order",
  );
  assert.equal(
    lineProblem({ ...barter, coupon: { kind: "promo", bonus: rupees(10) } })
      .field,
    "coupon",
  );
  assert.equal(
    lineProblem({ ...online(), productCost: rupees(500) }).field,
    "productCost",
  );
  assert.deepEqual(
    priceLine({ ...barter, productCost: rupees(0) }, DEFAULT_POLICY).issues,
    ["Add the product cost"],
  );
});

test("promo coupon is platform-funded: out of the platform fee", () => {
  const line = priceLine(
    online({
      order: { value: rupees(500), fundBps: 6000, feeBps: 1000 },
      bonus: rupees(0),
      coupon: { kind: "promo", bonus: rupees(20) },
    }),
    DEFAULT_POLICY,
  );
  // cost 300 + 20 = 320 ÷ 0.7 = 457.14 → ₹458
  const p = line.perEnrollment;
  assert.equal(p.brandCharge, paise(458));
  assert.equal(p.platformFee, paise(30)); // 50 − 20
  assert.equal(p.markup, paise(158));
  assert.equal(p.margin, paise(138));
  assert.equal(p.take, paise(188)); // 30 + 158 = 50 + 0 + 138
  assert.equal(p.creatorNet, paise(270)); // 250 + 20
  assert.equal(p.take, p.billed - p.creatorNet);
  assert.equal(line.platform.platformFee, paise(188));
  assert.deepEqual(line.platform.input.bonus, {
    amount_paise: 15_800,
    platform_cut: "1.0000",
  });
});

test("a coupon bigger than what the platform keeps is caught", () => {
  const line = priceLine(
    online({
      order: { value: rupees(500), fundBps: 6000, feeBps: 1000 },
      bonus: rupees(0),
      coupon: { kind: "promo", bonus: rupees(60) },
      price: rupees(300),
    }),
    DEFAULT_POLICY,
  );
  // no markup; platform fee 50 − 60 = −10
  assert.equal(line.perEnrollment.markup, 0);
  assert.equal(line.platform.platformFee, paise(-10));
  assert.equal(line.platform.input.bonus, undefined);
  assert.equal(line.perEnrollment.margin, paise(-60));
  assert.equal(line.belowFloor, true);
  assert.deepEqual(line.issues, [
    "The coupon costs more than the platform keeps on this line",
  ]);
});

test("share coupon: commission comes out of the take", () => {
  const line = priceLine(
    online({
      bonus: rupees(300),
      coupon: {
        kind: "share",
        bonus: rupees(50),
        commission: rupees(100),
      },
    }),
    DEFAULT_POLICY,
  );
  // cost 600 + 300 + 50 + 100 = 1,050 ÷ 0.7 = ₹1,500 exactly
  const p = line.perEnrollment;
  assert.equal(p.brandCharge, paise(1500));
  assert.equal(p.platformFee, paise(140)); // 100 + 90 − 50
  assert.equal(p.markup, paise(600));
  assert.equal(p.margin, paise(450));
  assert.equal(p.take, paise(640)); // 140 + 600 − 100 = 100 + 90 + 450
  assert.equal(p.take, p.billed - p.creatorNet - p.commission);
  assert.equal(line.marginRate, 0.3);
  assert.deepEqual(line.issues, []);
});

test("share coupon caps: commission ≤ ₹1,000, bonus + commission ≤ bonus pool", () => {
  const share = (commission) =>
    online({
      coupon: { kind: "share", bonus: rupees(50), commission },
    });
  assert.equal(lineProblem(share(rupees(1000))), null);
  assert.equal(lineProblem(share(rupees(1000.01))).field, "commission");
  assert.equal(lineProblem(share(rupees(0))).field, "commission");
  assert.equal(
    lineProblem(
      online({
        coupon: { kind: "share", bonus: rupees(0), commission: rupees(10) },
      }),
    ).field,
    "couponBonus",
  );

  // price at order + bonus leaves a ₹100 pool; 50 + 100 doesn't fit
  const tight = priceLine(
    online({
      bonus: rupees(100),
      coupon: { kind: "share", bonus: rupees(50), commission: rupees(100) },
      price: rupees(700),
    }),
    DEFAULT_POLICY,
  );
  assert.equal(tight.platform.bonusAmount, paise(100));
  assert.ok(
    tight.issues.includes(
      "The share bonus and commission can't exceed the bonus pool of ₹100",
    ),
  );
});

test("order pool: fee ≤ fund and creator cashback ≥ 50%, inclusive", () => {
  assert.equal(orderPoolProblem(5000, 0), null);
  assert.equal(orderPoolProblem(10_000, 5000), null);
  assert.match(orderPoolProblem(5000, 100), /cashback/);
  assert.match(orderPoolProblem(4000, 0), /cashback/);
  assert.match(orderPoolProblem(1000, 2000), /more than the funded share/);
  assert.equal(
    lineProblem(
      online({ order: { value: rupees(1), fundBps: 10_001, feeBps: 0 } }),
    ).field,
    "fundBps",
  );
  assert.equal(lineProblem(online({ order: undefined })).field, "order");
  assert.equal(
    lineProblem(checkin(100, { order: online().order })).field,
    "order",
  );
});

test("campaign settings stay inside the platform's bounds", () => {
  assert.equal(lineProblem(online({ expiryDays: 45 })), null);
  assert.equal(lineProblem(online({ expiryDays: 180 })), null);
  assert.equal(lineProblem(online({ expiryDays: 44 })).field, "expiryDays");
  assert.equal(lineProblem(online({ expiryDays: 181 })).field, "expiryDays");
  assert.equal(lineProblem(online({ oversubscribe: 100 })), null);
  assert.equal(lineProblem(online({ oversubscribe: 300 })), null);
  assert.equal(
    lineProblem(online({ oversubscribe: 99 })).field,
    "oversubscribe",
  );
  assert.equal(
    lineProblem(online({ oversubscribe: 301 })).field,
    "oversubscribe",
  );
  assert.equal(lineProblem(online({ slots: 0 })).field, "slots");
  assert.equal(lineProblem(online({ price: rupees(0) })).field, "price");
});

test("a price below the funded order and bonus can't go out", () => {
  const line = priceLine(online({ price: rupees(799) }), DEFAULT_POLICY);
  assert.equal(line.perEnrollment.markup, paise(-1));
  assert.deepEqual(line.issues, [
    "The price can't be below ₹800, the funded order and bonus",
  ]);
});

test("margin floor is inclusive and follows the policy", () => {
  const atFloor = priceLine(
    checkin(950, { price: rupees(1000) }),
    DEFAULT_POLICY,
  ); // 50 ÷ 1,000 = 5%
  assert.equal(atFloor.belowFloor, false);
  const under = priceLine(
    checkin(950, { price: rupees(999.99) }),
    DEFAULT_POLICY,
  ); // 49.99 ÷ 999.99
  assert.equal(under.belowFloor, true);
  const stricter = { ...DEFAULT_POLICY, marginFloorBps: 600 };
  assert.equal(
    priceLine(checkin(950, { price: rupees(1000) }), stricter).belowFloor,
    true,
  );
  assert.equal(marginBand(paise(50), paise(1000), DEFAULT_POLICY), "target");
  assert.equal(
    marginBand(paise(49), paise(1000), DEFAULT_POLICY),
    "below_floor",
  );
  assert.equal(marginBand(paise(150), paise(1000), DEFAULT_POLICY), "target");
  assert.equal(marginBand(paise(300), paise(1000), DEFAULT_POLICY), "default");
});

test("approval: only pricing below the margin floor needs it", () => {
  const healthy = checkin(700); // ₹1,000 at 30%
  const thin = checkin(700, { key: "b", slots: 500, price: rupees(778) }); // 10.0%
  const blended = priceLines([healthy, thin], DEFAULT_POLICY);
  // (30,000 + 39,000) ÷ (1,00,000 + 3,89,000) = 14.1%, above the 5% floor
  assert.equal(blended.total.margin, paise(69_000));
  assert.equal(blended.total.brandCharge, paise(489_000));
  assert.equal(blended.blendedBelowFloor, false);
  assert.equal(blended.needsApproval, false);
  const stricter = { ...DEFAULT_POLICY, marginFloorBps: 1500 };
  const strict = priceLines([healthy, thin], stricter);
  assert.equal(strict.blendedBelowFloor, true);
  assert.deepEqual(approvalReasons(strict, stricter), [
    "1 line is below the 15% margin floor",
    "Blended margin is below the 15% margin floor",
  ]);

  const floor = priceLines(
    [
      { ...healthy, slots: 10_000 },
      checkin(700, { key: "c", slots: 1, price: rupees(720) }),
    ],
    DEFAULT_POLICY,
  );
  assert.equal(floor.blendedBelowFloor, false);
  assert.equal(floor.belowFloorCount, 1);
  assert.deepEqual(approvalReasons(floor, DEFAULT_POLICY), [
    "1 line is below the 5% margin floor",
  ]);
  assert.equal(priceLines([], DEFAULT_POLICY).needsApproval, false);
});

test("platform floor: PLATFORM_MIN_MARGIN_RATE and _ABS", () => {
  const thin = online({
    order: { value: rupees(1000), fundBps: 6000, feeBps: 200 },
    bonus: rupees(0),
    price: rupees(600),
  });
  assert.deepEqual(priceLine(thin, DEFAULT_POLICY).issues, []);
  const rated = {
    ...DEFAULT_POLICY,
    platformFloor: { rateBps: 500, minimum: 0 },
  };
  // fee 20 < 5% of 600 = 30
  const line = priceLine(thin, rated);
  assert.equal(line.platform.floor, paise(30));
  assert.deepEqual(line.issues, [
    "The platform fee is below the platform's minimum margin",
  ]);
  const absolute = {
    ...DEFAULT_POLICY,
    platformFloor: { rateBps: 0, minimum: paise(25) },
  };
  assert.equal(priceLine(thin, absolute).issues.length, 1);
  assert.equal(priceLine(online(), rated).issues.length, 0);
});

test("a legacy full refund maps to a 100% fund with the same numbers", () => {
  const line = priceLine(
    online({
      order: { value: rupees(1000), fundBps: 10_000, feeBps: 1000 },
      slots: 350,
    }),
    DEFAULT_POLICY,
  );
  // the research example: ₹1,715 and ₹675 take per sale
  assert.equal(line.perEnrollment.brandCharge, paise(1715));
  assert.equal(line.perEnrollment.take, paise(675));
  assert.equal(line.total.take, paise(236_250));
});

test("rates truncate to the paisa, like the platform", () => {
  assert.equal(applyRate(99_999, 1250), 12_499); // 12,499.875
  assert.equal(applyRate(1, 5000), 0);
  assert.equal(applyRate(19_999, 5000), 9_999);
  assert.equal(applyRate(0, 3000), 0);
});

test("default price rounds up to a whole rupee", () => {
  assert.equal(priceForMargin(paise(70), 3000), paise(100));
  assert.equal(priceForMargin(paise(70.01), 3000), paise(101));
  assert.equal(priceForMargin(0, 3000), 0);
});

test("policy rules", () => {
  assert.equal(policyProblem(DEFAULT_POLICY), null);
  assert.match(
    policyProblem({ ...DEFAULT_POLICY, marginFloorBps: 3500 }),
    /floor can't be above the default margin/,
  );
  assert.match(
    policyProblem({ ...DEFAULT_POLICY, defaultFeeBps: 1500 }),
    /cashback/,
  );
  assert.match(
    policyProblem({ ...DEFAULT_POLICY, defaultMarginBps: 9500 }),
    /90%/,
  );
  assert.match(
    policyProblem({ ...DEFAULT_POLICY, defaultBonusFeeBps: 10_001 }),
    /between 0% and 100%/,
  );
});

test("switching archetype adds and drops the pools it implies", () => {
  const policy = {
    ...DEFAULT_POLICY,
    defaultFundBps: 7000,
    defaultFeeBps: 500,
  };
  const withCoupon = online({ coupon: { kind: "promo", bonus: rupees(10) } });
  const barter = patchLine(withCoupon, { archetype: "barter" }, policy);
  assert.equal(barter.order, undefined);
  assert.deepEqual(barter.coupon, { kind: "none" });
  assert.deepEqual(barter.productCost, rupees(0));
  const back = patchLine(barter, { archetype: "online_purchase" }, policy);
  assert.equal(back.productCost, undefined);
  assert.deepEqual(back.order, {
    value: rupees(0),
    fundBps: 7000,
    feeBps: 500,
  });
  assert.equal(
    patchLine(online({ price: rupees(9) }), { price: null }, policy).price,
    undefined,
  );

  const fresh = blankLine("k", policy);
  assert.equal(fresh.order.fundBps, 7000);
  assert.equal(fresh.bonusFeeBps, 3000);
  assert.equal(lineProblem(fresh), null);
  assert.equal(blankLine("k2", policy, barter).archetype, "barter");
});

test("freezing writes the default price so a policy change can't move it", () => {
  const [frozen] = freezeLines([online()], DEFAULT_POLICY);
  assert.deepEqual(frozen.price, rupees(1143));
  const later = { ...DEFAULT_POLICY, defaultMarginBps: 4000 };
  assert.equal(priceLine(frozen, later).perEnrollment.brandCharge, paise(1143));
});

test("approval payload in the platform's shape", () => {
  const payload = approvalPayload(
    [
      online(),
      online({
        key: "b",
        bonus: rupees(300),
        coupon: { kind: "share", bonus: rupees(50), commission: rupees(100) },
        slotMode: "pool",
        expiryDays: 90,
        oversubscribe: 200,
      }),
      online({ key: "c", coupon: { kind: "promo", bonus: rupees(20) } }),
    ],
    { mode: "postpaid", creditLimit: rupees(50_000) },
    DEFAULT_POLICY,
  );
  assert.deepEqual(payload.organization, {
    payment_mode: "postpaid",
    credit_limit_paise: 5_000_000,
  });
  assert.deepEqual(payload.campaigns[0], {
    product: "Earbuds",
    archetype: "online_purchase",
    approve: {
      pricing: {
        order: { fund: "0.6000", platform_cut: "0.1000" },
        bonus: { amount_paise: 54_300, platform_cut: "0.7422" },
      },
      share_enabled: false,
    },
    campaign: {
      max_enrollments: 100,
      slot_mode: "lines",
      enrollment_expiry_days: 45,
      oversubscribe_factor: "1.50",
    },
  });
  assert.deepEqual(payload.campaigns[1].approve.share_enabled, true);
  assert.equal(payload.campaigns[1].approve.share_bonus, 5000);
  assert.equal(payload.campaigns[1].approve.share_commission, 10_000);
  assert.deepEqual(payload.campaigns[1].campaign, {
    max_enrollments: 100,
    slot_mode: "pool",
    enrollment_expiry_days: 90,
    oversubscribe_factor: "2.00",
  });
  assert.deepEqual(payload.campaigns[2].promo_coupon, { bonus_paise: 2000 });
  assert.equal(
    approvalPayload([online()], { mode: "prepaid" }, DEFAULT_POLICY)
      .organization.credit_limit_paise,
    null,
  );
});

test("percent and factor input", () => {
  assert.equal(parsePercent("10"), 1000);
  assert.equal(parsePercent("12.5%"), 1250);
  assert.equal(parsePercent("0.05"), 5);
  assert.equal(parsePercent("100"), 10_000);
  assert.equal(parsePercent("100.01"), null);
  assert.equal(parsePercent("-1"), null);
  assert.equal(parsePercent("1.234"), null);
  assert.equal(parseFactor("1.5"), 150);
  assert.equal(parseFactor("2x"), 200);
  assert.equal(parseFactor("3"), 300);
  assert.equal(parseFactor("0.9"), null);
  assert.equal(parseFactor("3.01"), null);
  assert.equal(parseFactor("1.555"), null);
});
