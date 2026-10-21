import assert from "node:assert/strict";
import { test } from "node:test";
import {
  benchmarkOf,
  benchmarksFor,
  brandKey,
  leaderCount,
  dailyGains,
  domainKey,
  parseProductUrl,
  parseUrlList,
  roundDown,
  sameBrand,
  scoreBand,
  scoreProduct,
  talkingPoint,
  velocity,
} from "./prospecting.ts";

const DAY = 24 * 60 * 60_000;
const now = Date.UTC(2026, 9, 21, 12);

test("reads product ids from every supported marketplace", () => {
  const cases = [
    [
      "https://www.amazon.in/Mamaearth-Onion-Hair-Oil/dp/b07w6vwy8l?th=1&tag=x",
      "amazon",
      "B07W6VWY8L",
      "https://www.amazon.in/Mamaearth-Onion-Hair-Oil/dp/B07W6VWY8L",
    ],
    [
      "amazon.com/gp/product/B0CHX1W1XY",
      "amazon",
      "B0CHX1W1XY",
      "https://www.amazon.com/dp/B0CHX1W1XY",
    ],
    [
      "https://dl.flipkart.com/s/mamaearth-onion-oil/p/itm6f3a2b1c?pid=HOLF",
      "flipkart",
      "itm6f3a2b1c",
      "https://dl.flipkart.com/s/mamaearth-onion-oil/p/itm6f3a2b1c",
    ],
    [
      "https://www.myntra.com/hair-oil/mamaearth/mamaearth-onion/12345678/buy",
      "myntra",
      "12345678",
    ],
    [
      "https://www.nykaa.com/mamaearth-onion-hair-oil/p/412345?skuId=1",
      "nykaa",
      "412345",
    ],
    [
      "https://www.ajio.com/levis-tee/p/443105009_wine",
      "ajio",
      "443105009_wine",
    ],
    [
      "https://www.purplle.com/product/plum-green-tea-toner-12345",
      "purplle",
      "12345",
    ],
    [
      "https://www.tatacliq.com/x/p-mp000000017466101",
      "tatacliq",
      "MP000000017466101",
    ],
    ["https://blinkit.com/prn/x/prid/39424", "blinkit", "39424"],
    ["https://www.swiggy.com/instamart/item/ABC12", "swiggyinstamart", "ABC12"],
  ];
  for (const [input, marketplace, identifier, url] of cases) {
    const parsed = parseProductUrl(input);
    assert.equal(parsed.ok, true, input);
    assert.equal(parsed.marketplace, marketplace, input);
    assert.equal(parsed.identifier, identifier, input);
    if (url) assert.equal(parsed.url, url, input);
    assert.equal(parsed.key, `${marketplace}:${identifier.toLowerCase()}`);
  }
});

test("explains links it can't watch", () => {
  const reason = (input) => parseProductUrl(input).reason;
  assert.match(reason("https://amzn.in/d/abc"), /Short links/);
  assert.equal(
    reason("https://www.instagram.com/mamaearth"),
    "Not a product marketplace",
  );
  assert.equal(
    reason("https://www.swiggy.com/restaurants/x"),
    "Not a product marketplace",
  );
  assert.equal(
    reason("https://www.example.com/p/123"),
    "Marketplace not supported",
  );
  assert.match(reason("https://www.amazon.in/s?k=onion+oil"), /No product id/);
  assert.equal(reason("not a link"), "Not a valid link");
  assert.equal(reason("ftp://amazon.in/dp/B07W6VWY8L"), "Not a web link");
  assert.equal(parseProductUrl("https://notamazon.in/dp/B07W6VWY8L").ok, false);
});

test("pulls links out of a CSV, skips the header and flags repeats", () => {
  const csv = [
    "brand,url,notes",
    'Mamaearth,"https://www.amazon.in/dp/B07W6VWY8L?ref=x",hero',
    "Mamaearth,https://www.amazon.in/Onion/dp/B07W6VWY8L,again",
    "Plum,https://www.nykaa.com/plum/p/9981",
    "Broken,no link here",
    "",
    "https://amzn.to/xyz",
  ].join("\n");
  const entries = parseUrlList(csv);
  assert.deepEqual(
    entries.map((entry) => [entry.line, entry.status]),
    [
      [2, "ready"],
      [3, "duplicate"],
      [4, "ready"],
      [5, "invalid"],
      [7, "invalid"],
    ],
  );
  assert.equal(entries[0].url, "https://www.amazon.in/dp/B07W6VWY8L");
});

test("brand keys ignore company suffixes, case and punctuation", () => {
  assert.equal(brandKey("Mamaearth India Pvt. Ltd."), "mamaearth");
  assert.equal(brandKey("The Man Company"), "man");
  assert.equal(brandKey("Plum Goodness"), "plumgoodness");
  assert.equal(brandKey("Bombay Shaving & Co"), "bombayshavingand");
  assert.equal(domainKey("shop.mamaearth.in"), "mamaearth");
  assert.equal(domainKey("www.sugar.co.in"), "sugar");
  assert.equal(
    sameBrand("mamaearth", { name: "Honasa", domain: "mamaearth.in" }),
    true,
  );
  assert.equal(sameBrand("mamaearth", { name: "Mamaearth" }), true);
  assert.equal(sameBrand("plum", { name: "Plum Goodness" }), false);
});

test("velocity is ratings per week between the first and last reading in the window", () => {
  const points = [
    { at: now - 40 * DAY, count: 0 },
    { at: now - 14 * DAY, count: 100 },
    { at: now - 7 * DAY, count: 110 },
    { at: now, count: 128 },
  ];
  assert.equal(velocity(points, now), 14);
  assert.equal(velocity(points.slice(-1), now), null);
  assert.equal(
    velocity(
      [
        { at: now - 3600_000, count: 1 },
        { at: now, count: 9 },
      ],
      now,
    ),
    null,
  );
  assert.equal(
    velocity(
      [
        { at: now - 7 * DAY, count: 50 },
        { at: now, count: 40 },
      ],
      now,
    ),
    0,
  );
});

test("daily gains spread readings over calendar days", () => {
  const points = [
    { at: now - 5 * DAY, count: 10 },
    { at: now - 2 * DAY, count: 16 },
    { at: now - 1 * DAY, count: 17 },
    { at: now, count: 20 },
  ];
  assert.deepEqual(dailyGains(points, now, 4), [0, 6, 1, 3]);
  assert.deepEqual(dailyGains([], now, 3), [0, 0, 0]);
});

test("benchmark is the median of the top quarter (one to five leaders), with at least three peers", () => {
  assert.equal(leaderCount(3), 1);
  assert.equal(leaderCount(8), 2);
  assert.equal(leaderCount(9), 3);
  assert.equal(leaderCount(40), 5);
  assert.equal(benchmarkOf([5, 9]), null);
  assert.equal(benchmarkOf([10, 300, 20]), 300);
  assert.equal(benchmarkOf([12, 900, 340, 410, 20, 300, 8, 15]), 655);
  const many = Array.from({ length: 20 }, (_, index) => (index + 1) * 10);
  assert.equal(benchmarkOf(many), 180);
});

test("benchmarks prefer a set number, then the category, then the watchlist", () => {
  const products = [
    { id: "a", category: "Hair care", ratingsCount: 1200, velocity: 40 },
    { id: "b", category: "Hair care", ratingsCount: 800, velocity: 20 },
    { id: "c", category: "hair care ", ratingsCount: 12, velocity: 1 },
    { id: "d", category: "Skin care", ratingsCount: 50, velocity: null },
    { id: "e", category: null, ratingsCount: null, velocity: null },
  ];
  const map = benchmarksFor(products);
  assert.deepEqual(map.get("a"), {
    ratings: 1200,
    source: "category",
    leaderVelocity: 40,
    peers: 3,
  });
  assert.equal(map.get("d").source, "watchlist");
  assert.equal(map.get("d").ratings, 1200);
  assert.equal(map.get("e").source, "watchlist");
  const set = benchmarksFor(products, 500);
  assert.equal(set.get("c").ratings, 500);
  assert.equal(set.get("c").source, "set");
  assert.equal(benchmarksFor(products.slice(3)).get("d"), null);
});

test("scores weight the gap, the pace to close it and the rating", () => {
  const benchmark = {
    ratings: 300,
    source: "category",
    leaderVelocity: 12,
    peers: 6,
  };
  const small = scoreProduct({
    ratingsCount: 12,
    rating: 4.4,
    velocity: 0.5,
    benchmark,
  });
  assert.equal(small.gap, 288);
  assert.equal(small.share, 0.04);
  assert.equal(small.weeksToClose, 576);
  assert.equal(small.score, Math.round(60 * 0.96 + 25 * 1 + 15 * 1));
  assert.equal(scoreBand(small.score), "hot");
  assert.match(
    small.reasons[0],
    /12 ratings against 300 for category leaders: 4% of the way/,
  );
  assert.match(
    small.reasons[1],
    /over 5 years to catch up \(leaders gain 12 a week\)/,
  );
  assert.match(small.reasons[2], /good product short on social proof/);

  const leader = scoreProduct({
    ratingsCount: 900,
    rating: 4.1,
    velocity: 20,
    benchmark,
  });
  assert.equal(leader.gap, 0);
  assert.equal(leader.score, Math.round(15 * 0.7));
  assert.equal(scoreBand(leader.score), "cool");

  const unknownPace = scoreProduct({
    ratingsCount: 150,
    rating: null,
    velocity: null,
    benchmark,
  });
  assert.equal(unknownPace.score, Math.round(60 * 0.5 + 25 * 0.5 + 15 * 0.5));
  assert.match(unknownPace.reasons[1], /Pace not known/);

  const stalled = scoreProduct({
    ratingsCount: 150,
    rating: 3,
    velocity: 0,
    benchmark,
  });
  assert.equal(stalled.weeksToClose, null);
  assert.equal(stalled.score, Math.round(60 * 0.5 + 25 + 15 * 0.15));

  assert.equal(
    scoreProduct({ ratingsCount: 5, rating: 4, velocity: 1, benchmark: null }),
    null,
  );
  assert.equal(
    scoreProduct({ ratingsCount: null, rating: 4, velocity: 1, benchmark }),
    null,
  );
});

test("talking points round the benchmark down and shorten the title", () => {
  assert.equal(roundDown(340), 340);
  assert.equal(roundDown(1287), 1200);
  assert.equal(roundDown(87), 87);
  assert.equal(
    talkingPoint({
      title: "Mamaearth Onion Hair Oil for Hair Growth with Redensyl 250 ml",
      marketplace: "amazon",
      ratingsCount: 12,
      benchmark: {
        ratings: 1287,
        source: "watchlist",
        leaderVelocity: null,
        peers: 4,
      },
    }),
    "Your Mamaearth Onion Hair Oil for Hair… on Amazon has 12 ratings; category leaders have 1,200+.",
  );
});
