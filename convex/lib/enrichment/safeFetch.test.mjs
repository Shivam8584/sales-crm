import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Refused,
  fetchPage,
  fetchableUrl,
  isPublicHost,
  isPublicIp,
} from "./safeFetch.ts";

test("private, loopback, link-local and metadata addresses are not public", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
    "2001:db8::1",
  ]) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  for (const ip of ["8.8.8.8", "172.32.0.1", "1.1.1.1", "2606:4700::1111"]) {
    assert.equal(isPublicIp(ip), true, ip);
  }
});

test("hostnames: internal names and IP literals are refused", () => {
  for (const host of [
    "localhost",
    "foo.localhost",
    "db",
    "metadata.google.internal",
    "printer.local",
    "svc.cluster.local",
    "127.0.0.1",
    "[::1]",
    "[fe80::1]",
    "1.2.3",
    "1.2.3.4.5",
    "bad_host.com",
    "",
  ]) {
    assert.equal(isPublicHost(host), false, host);
  }
  for (const host of [
    "baybee.co.in",
    "WWW.Example.com.",
    "xn--bcher-kva.example",
    "8.8.8.8",
  ]) {
    assert.equal(isPublicHost(host), true, host);
  }
});

test("alternative IPv4 spellings are caught once the URL is parsed", () => {
  for (const url of [
    "https://2130706433/",
    "https://0x7f.1/",
    "https://0177.0.0.1/",
    "https://[::ffff:127.0.0.1]/",
  ]) {
    assert.throws(() => fetchableUrl(url), Refused, url);
  }
});

test("only plain https on the default port without logins", () => {
  assert.equal(
    fetchableUrl("https://baybee.co.in").href,
    "https://baybee.co.in/",
  );
  assert.equal(fetchableUrl("https://baybee.co.in:443/x").port, "");
  for (const url of [
    "http://baybee.co.in/",
    "ftp://baybee.co.in/",
    "https://baybee.co.in:8443/",
    "https://user:pw@baybee.co.in/",
    "not a url",
  ]) {
    assert.throws(() => fetchableUrl(url), Refused, url);
  }
});

function responder(steps) {
  const seen = [];
  const request = async (url) => {
    seen.push(url.href);
    const step = steps[seen.length - 1];
    return typeof step === "function" ? step(url) : step;
  };
  return { request, seen };
}

test("follows redirects and returns the final page", async () => {
  const { request, seen } = responder([
    { status: 301, location: "https://www.baybee.co.in/" },
    { status: 302, location: "/home" },
    { status: 200, body: "<html></html>" },
  ]);
  const page = await fetchPage("https://baybee.co.in", request);
  assert.equal(page.url, "https://www.baybee.co.in/home");
  assert.equal(page.html, "<html></html>");
  assert.deepEqual(seen, [
    "https://baybee.co.in/",
    "https://www.baybee.co.in/",
    "https://www.baybee.co.in/home",
  ]);
});

test("every redirect hop is re-validated", async () => {
  for (const location of [
    "http://baybee.co.in/",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/",
    "ftp://x.in/",
    "https://baybee.co.in:22/",
  ]) {
    const { request, seen } = responder([{ status: 302, location }]);
    await assert.rejects(
      fetchPage("https://baybee.co.in", request),
      Refused,
      location,
    );
    assert.equal(seen.length, 1);
  }
});

test("gives up after three redirects", async () => {
  const hop = { status: 302, location: "/next" };
  const { request, seen } = responder([hop, hop, hop, hop, hop]);
  await assert.rejects(fetchPage("https://baybee.co.in", request), /too many/);
  assert.equal(seen.length, 4);
});

test("non-2xx answers and exhausted time are refused", async () => {
  const { request } = responder([{ status: 404, body: "" }]);
  await assert.rejects(fetchPage("https://baybee.co.in", request), /HTTP 404/);

  let clock = 0;
  const slow = async () => {
    clock += 6_000;
    return { status: 302, location: "/again" };
  };
  await assert.rejects(
    fetchPage("https://baybee.co.in", slow, { now: () => clock }),
    /took too long/,
  );
});
