import assert from "node:assert/strict";
import { test } from "node:test";
import { brandName, extractMeta, findGstins, pageMeta } from "./html.ts";

const PAGE = `<!doctype html><html><head>
<title> Shop &amp; Save | Baybee </title>
<meta name="description" content='Kids &quot;furniture&quot; &#38; toys'>
<meta property="og:site_name" content="Baybee Kids">
<link rel="canonical" href="/home">
<script>var gst = "29AAACI4798L1ZU";</script>
</head><body>
<footer>GSTIN: 29AAACI4798L1ZU and 10BSDPG0911J1ZG, bogus 29AAACI4798L1ZA</footer>
<svg><title>icon</title></svg>
</body></html>`;

test("extracts title, description, site name and canonical", () => {
  const meta = extractMeta(PAGE, "https://baybee.co.in/");
  assert.equal(meta.title, "Shop & Save | Baybee");
  assert.equal(meta.description, 'Kids "furniture" & toys');
  assert.equal(meta.siteName, "Baybee Kids");
  assert.equal(meta.canonical, "https://baybee.co.in/home");
});

test("a canonical that is not https is dropped", () => {
  const meta = extractMeta(
    '<head><link rel="canonical" href="http://x.in/"><link rel="canonical" href="javascript:alert(1)"></head>',
    "https://x.in/",
  );
  assert.equal(meta.canonical, undefined);
});

test("falls back to og:description and ignores a missing head", () => {
  const meta = extractMeta(
    '<meta property="og:description" content="Hello"><title>T</title>',
    "https://x.in/",
  );
  assert.equal(meta.description, "Hello");
  assert.equal(meta.title, "T");
});

test("finds only visible GSTINs with a correct check character", () => {
  assert.deepEqual(findGstins(PAGE), ["29AAACI4798L1ZU", "10BSDPG0911J1ZG"]);
  assert.deepEqual(findGstins("<p>gstin 29aaaci4798l1zu.</p>"), [
    "29AAACI4798L1ZU",
  ]);
  assert.deepEqual(findGstins("<p>X29AAACI4798L1ZUX</p>"), []);
});

test("brand name prefers og:site_name, then the title segment matching the domain", () => {
  assert.deepEqual(
    brandName({ siteName: "Baybee Kids", title: "x" }, "baybee.co.in"),
    {
      name: "Baybee Kids",
      confidence: 0.7,
    },
  );
  assert.deepEqual(
    brandName({ title: "Shop & Save | Baybee" }, "www.baybee.co.in"),
    {
      name: "Baybee",
      confidence: 0.6,
    },
  );
  assert.equal(brandName({ title: "Welcome" }, "baybee.co.in"), null);
  assert.equal(brandName({}, "baybee.co.in"), null);
});

test("page meta gathers the pieces", () => {
  const page = pageMeta(PAGE, "https://baybee.co.in/");
  assert.equal(page.url, "https://baybee.co.in/");
  assert.equal(page.gstins.length, 2);
});
