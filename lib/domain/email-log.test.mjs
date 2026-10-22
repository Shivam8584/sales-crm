import assert from "node:assert/strict";
import test from "node:test";
import { isAuthenticated } from "../../deploy/inbound-email-worker/auth.js";
import {
  customerRecipients,
  domainOf,
  parseForwarded,
  parseForwardedDate,
  parseMailboxes,
} from "./email-log.ts";

test("parseMailboxes normalises, dedupes and drops junk", () => {
  assert.deepEqual(
    parseMailboxes([
      { email: " Asha@Kesar.in ", name: "Asha" },
      "Asha Menon <asha@kesar.in>",
      "not an address",
      { name: "No email" },
      7,
    ]),
    [{ email: "asha@kesar.in", name: "Asha" }],
  );
  assert.deepEqual(parseMailboxes(undefined), []);
  assert.equal(parseMailboxes(Array(80).fill("a@b.in")).length, 1);
});

test("domainOf reads bare and named addresses", () => {
  assert.equal(domainOf("Hypedrive <no-reply@hypedrive.app>"), "hypedrive.app");
  assert.equal(domainOf("x@Kesar.in"), "kesar.in");
  assert.equal(domainOf(undefined), null);
  assert.equal(domainOf("nobody"), null);
});

test("customerRecipients drops teammates, the log address and our domains", () => {
  const skip = {
    memberEmails: new Set(["rep1@example.com", "boss@example.com"]),
    logAddress: "log@replies.hypedrive.app",
    ownDomains: ["hypedrive.app", "mail.sender.io"],
  };
  const kept = customerRecipients(
    parseMailboxes([
      "rep1@example.com",
      "log@replies.hypedrive.app",
      "support@hypedrive.app",
      "ops@replies.hypedrive.app",
      "x@mail.sender.io",
      "asha@kesar.in",
      "lookalike@nothypedrive.app",
      "ravi@kesar.in",
    ]),
    skip,
  );
  assert.deepEqual(
    kept.map((mailbox) => mailbox.email),
    ["asha@kesar.in", "lookalike@nothypedrive.app", "ravi@kesar.in"],
  );
});

const GMAIL = `FYI, can you follow up?

---------- Forwarded message ---------
From: Asha Menon <asha@kesar.in>
Date: Mon, 5 Jan 2026 at 10:30
Subject: Re: Pricing
To: Rep One <rep1@example.com>

Hi, please send the revised quote.

Thanks,
Asha`;

test("parseForwarded reads a Gmail forward", () => {
  const forwarded = parseForwarded(GMAIL, "Fwd: Re: Pricing");
  assert.equal(forwarded.from.email, "asha@kesar.in");
  assert.equal(forwarded.from.name, "Asha Menon");
  assert.equal(forwarded.subject, "Re: Pricing");
  assert.equal(forwarded.date, Date.parse("2026-01-05T10:30:00+05:30"));
  assert.equal(
    forwarded.body,
    "Hi, please send the revised quote.\n\nThanks,\nAsha",
  );
});

test("parseForwarded reads an Apple Mail forward with quote prefixes", () => {
  const forwarded = parseForwarded(
    `Begin forwarded message:\n\n> From: "Ravi K" <ravi@acme.com>\n> Subject: Demo\n> Date: 5 January 2026 at 4:00:00 PM IST\n> To: rep1@example.com\n>\n> Can we meet Friday?`,
  );
  assert.equal(forwarded.from.email, "ravi@acme.com");
  assert.equal(forwarded.from.name, "Ravi K");
  assert.equal(forwarded.date, Date.parse("2026-01-05T16:00:00+05:30"));
  assert.equal(forwarded.body, "Can we meet Friday?");
});

test("parseForwarded needs a marker or a Fwd: subject", () => {
  const plain = "From: Asha <asha@kesar.in>\nDate: 5 Jan 2026\n\nhello";
  assert.equal(parseForwarded(plain, "Pricing"), null);
  assert.equal(parseForwarded(plain)?.from.email, undefined);
  assert.equal(
    parseForwarded(plain, "FW: Pricing")?.from.email,
    "asha@kesar.in",
  );
  assert.equal(parseForwarded("Begin forwarded message:\n\nno headers"), null);
  assert.equal(
    parseForwarded(
      "---------- Forwarded message ---------\nFrom: nobody\n\nhi",
    ),
    null,
  );
});

test("parseForwardedDate rejects unreadable and future dates", () => {
  const now = Date.parse("2026-01-06T00:00:00Z");
  assert.equal(parseForwardedDate("yesterday", now), null);
  assert.equal(parseForwardedDate("1", now), null);
  assert.equal(parseForwardedDate("5 Jan 2030 10:00", now), null);
  assert.equal(
    parseForwardedDate("Mon, 5 Jan 2026 at 10:30 (IST)", now),
    Date.parse("2026-01-05T10:30:00+05:30"),
  );
});

const headers = (...pairs) => pairs.map(([key, value]) => ({ key, value }));

test("isAuthenticated trusts a passing, aligned result from the receiver", () => {
  assert.equal(
    isAuthenticated(
      headers([
        "authentication-results",
        "mx.cloudflare.net; dkim=pass header.d=example.com header.s=s1; spf=fail smtp.mailfrom=x@evil.io",
      ]),
      "example.com",
    ),
    true,
  );
  assert.equal(
    isAuthenticated(
      headers([
        "authentication-results",
        "mx.cloudflare.net; dkim=none; spf=pass smtp.mailfrom=bounce@mail.example.com",
      ]),
      "example.com",
    ),
    true,
  );
  assert.equal(
    isAuthenticated(
      headers([
        "arc-authentication-results",
        "i=1; mx.cloudflare.net; dkim=pass header.d=Example.com",
      ]),
      "example.com",
    ),
    true,
  );
  assert.equal(
    isAuthenticated(
      headers([
        "received-spf",
        "pass (mx.cloudflare.net: domain of rep@example.com designates 1.2.3.4) receiver=mx.cloudflare.net; envelope-from=<rep@example.com>; helo=mail.example.com",
      ]),
      "example.com",
    ),
    true,
  );
});

test("isAuthenticated is false for absent, failed, unaligned, foreign or forged headers", () => {
  assert.equal(isAuthenticated([], "example.com"), false);
  assert.equal(isAuthenticated(undefined, "example.com"), false);
  assert.equal(
    isAuthenticated(headers(["subject", "dkim=pass"]), "example.com"),
    false,
  );
  assert.equal(
    isAuthenticated(
      headers([
        "authentication-results",
        "mx.cloudflare.net; dkim=fail header.d=example.com; spf=softfail",
      ]),
      "example.com",
    ),
    false,
  );
  assert.equal(
    isAuthenticated(
      headers([
        "authentication-results",
        "mx.cloudflare.net; dkim=pass header.d=evil.io",
      ]),
      "example.com",
    ),
    false,
  );
  assert.equal(
    isAuthenticated(
      headers([
        "authentication-results",
        "mx.attacker.test; dkim=pass header.d=example.com",
      ]),
      "example.com",
    ),
    false,
  );
  assert.equal(
    isAuthenticated(
      headers(
        [
          "authentication-results",
          "mx.cloudflare.net; dkim=fail header.d=example.com",
        ],
        [
          "authentication-results",
          "mx.cloudflare.net; dkim=pass header.d=example.com",
        ],
      ),
      "example.com",
    ),
    false,
  );
  assert.equal(
    isAuthenticated(
      headers([
        "authentication-results",
        "mx.cloudflare.net; dkim=pass header.d=example.com",
      ]),
      "",
    ),
    false,
  );
});
