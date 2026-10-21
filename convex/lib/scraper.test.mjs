import assert from "node:assert/strict";
import { test } from "node:test";
import { sandboxScrape, scrapeBatch, scraperMode } from "./scraper.ts";

const env = {
  SCRAPER_WORKER_URL: "http://scraper:8080/",
  SCRAPER_AUTH_TOKEN: "t0k",
};
const DAY = 24 * 60 * 60_000;

function reply(status, body, headers = {}) {
  return async (url, init) => {
    reply.last = { url, init };
    return new Response(
      typeof body === "string" ? body : JSON.stringify(body),
      {
        status,
        headers,
      },
    );
  };
}

test("mode needs both live settings, else the sandbox flag", () => {
  assert.equal(scraperMode(env), "live");
  assert.equal(
    scraperMode({ SCRAPER_WORKER_URL: "x", SCRAPER_SANDBOX: "1" }),
    "sandbox",
  );
  assert.equal(scraperMode({}), null);
});

test("a 207 batch maps products and per-item problems", async () => {
  const fetchImpl = reply(207, {
    responses: [
      {
        id: "a",
        status: 200,
        product: {
          title: "  Onion   Hair Oil ",
          brand: "Zestly",
          category: "Hair care",
          identifier: "B0QA3ZES03",
          sale_price: { amount: 34900, currency: "INR" },
          mrp: { amount: 49900, currency: "XYZ" },
          images: [
            { url: "https://img/1.jpg" },
            { url: "https://img/2.jpg", is_primary: true },
          ],
          rating: { value: 4.26, count: 1287 },
          variations: [{}, {}],
        },
      },
      {
        id: "b",
        status: 404,
        error: {
          type: "https://errors.hypedrive.app/scrape/product-not-found",
          title: "Product not found",
          status: 404,
          retryable: false,
        },
      },
      {
        id: "c",
        status: 502,
        error: {
          type: "https://errors.hypedrive.app/scrape/extraction-failed",
          title: "Extraction failed",
          status: 502,
          retryable: true,
        },
      },
    ],
  });
  const results = await scrapeBatch(
    env,
    [
      { id: "a", url: "https://www.amazon.in/dp/B0QA3ZES03" },
      { id: "b", url: "https://www.amazon.in/dp/B000000001" },
      { id: "c", url: "https://www.nykaa.com/x/p/1" },
      { id: "d", url: "https://www.nykaa.com/x/p/2" },
    ],
    fetchImpl,
  );
  assert.equal(reply.last.url, "http://scraper:8080/v1/scrape/batch");
  assert.equal(reply.last.init.headers.Authorization, "Bearer t0k");
  assert.equal(JSON.parse(reply.last.init.body).requests.length, 4);
  assert.deepEqual(results[0], {
    id: "a",
    ok: true,
    listing: {
      title: "Onion Hair Oil",
      brand: "Zestly",
      category: "Hair care",
      identifier: "B0QA3ZES03",
      price: { amount: 34900, currency: "INR" },
      mrp: null,
      rating: 4.3,
      ratingsCount: 1287,
      imageUrl: "https://img/2.jpg",
      variants: 2,
    },
  });
  assert.deepEqual(results[1], {
    id: "b",
    ok: false,
    error: "Product not found: it may be delisted",
    retryable: false,
  });
  assert.equal(results[2].retryable, true);
  assert.match(results[2].error, /retries on the next refresh/);
  assert.deepEqual(results[3], {
    id: "d",
    ok: false,
    error: "No result for this link",
    retryable: true,
  });
});

test("envelope errors fail every item with a readable reason", async () => {
  const items = [{ id: "a", url: "https://www.amazon.in/dp/B0QA3ZES03" }];
  const unauthorized = await scrapeBatch(
    env,
    items,
    reply(401, { title: "Unauthorized", status: 401 }),
  );
  assert.match(unauthorized[0].error, /SCRAPER_AUTH_TOKEN/);
  assert.equal(unauthorized[0].retryable, false);
  const busy = await scrapeBatch(
    env,
    items,
    reply(503, "", { "Retry-After": "12" }),
  );
  assert.equal(busy[0].error, "Scraper busy, retry in 12 s");
  const invalid = await scrapeBatch(
    env,
    items,
    reply(400, {
      type: "https://errors.hypedrive.app/scrape/invalid-request",
      title: "Invalid request",
      status: 400,
    }),
  );
  assert.equal(invalid[0].error, "The scraper rejected this link");
  const down = await scrapeBatch(env, items, async () => {
    throw new TypeError("fetch failed");
  });
  assert.deepEqual(down[0], {
    id: "a",
    ok: false,
    error: "Couldn't reach the scraper",
    retryable: true,
  });
  const garbled = await scrapeBatch(env, items, reply(207, "<html>"));
  assert.equal(garbled[0].error, "The scraper sent an unreadable response");
  await assert.rejects(
    scrapeBatch(
      env,
      Array.from({ length: 51 }, (_, index) => ({
        id: String(index),
        url: "x",
      })),
    ),
    /at most 50/,
  );
});

test("sandbox data is deterministic and ratings grow day by day", () => {
  const item = {
    id: "p",
    url: "https://www.amazon.in/Zestly-Hair-Growth-Oil/dp/B0QA3ZES03",
  };
  const at = Date.UTC(2026, 9, 21);
  const today = sandboxScrape(item, at);
  assert.deepEqual(sandboxScrape(item, at), today);
  assert.equal(today.listing.brand, "Zestly");
  assert.equal(today.listing.category, "Hair care");
  assert.equal(today.listing.title, "Zestly Hair Growth Oil");
  const later = sandboxScrape(item, at + 30 * DAY);
  assert.ok(later.listing.ratingsCount >= today.listing.ratingsCount);
  const myntra = sandboxScrape(
    {
      id: "m",
      url: "https://www.myntra.com/kurta/rangrez/rangrez-printed-kurta/90010001/buy",
    },
    at,
  );
  assert.equal(myntra.listing.brand, "Rangrez");
  assert.equal(myntra.listing.category, "Apparel");
  assert.equal(
    sandboxScrape({ id: "x", url: "https://www.amazon.in/dp/B000000001" }, at)
      .ok,
    false,
  );
  assert.equal(
    sandboxScrape({ id: "y", url: "https://www.nykaa.com/x/p/1239999" }, at)
      .retryable,
    true,
  );
});
