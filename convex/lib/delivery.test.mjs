import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  deliver,
  emailHeaders,
  emailProvider,
  repliesTracked,
  smtpFailure,
} from "./automations/delivery.ts";

const SMTP_ENV = {
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "user",
  SMTP_PASSWORD: "secret",
  EMAIL_FROM: "Team <team@example.com>",
};

afterEach(() => {
  for (const key of [...Object.keys(SMTP_ENV), "EMAIL_REPLY_TO"]) {
    delete process.env[key];
  }
});

test("smtp is used only when fully configured", () => {
  Object.assign(process.env, SMTP_ENV);
  assert.deepEqual(emailProvider(), { provider: "smtp" });
  delete process.env.SMTP_PASSWORD;
  delete process.env.EMAIL_FROM;
  assert.deepEqual(emailProvider(), {
    provider: "outbox",
    problem:
      "EMAIL_PROVIDER is smtp but SMTP_PASSWORD and EMAIL_FROM are missing",
  });
});

test("smtp failures retry only when the server surely refused", () => {
  assert.deepEqual(
    smtpFailure({ responseCode: 451, message: "Try again later" }),
    { ok: false, error: "451: Try again later", retryable: true },
  );
  assert.equal(
    smtpFailure({ responseCode: 550, message: "No such user" }).retryable,
    false,
  );
  assert.equal(
    smtpFailure({ code: "ECONNECTION", message: "refused" }).retryable,
    true,
  );
  assert.equal(
    smtpFailure({ code: "ETIMEDOUT", message: "timed out" }).retryable,
    false,
  );
  assert.equal(
    smtpFailure({
      code: "ESOCKET",
      message: "connect ECONNREFUSED 10.0.0.9:587",
    }).retryable,
    true,
  );
  assert.equal(
    smtpFailure({ code: "ESOCKET", message: "read ECONNRESET" }).retryable,
    false,
  );
});

test("email to anything but one plain address is refused before sending", async () => {
  for (const to of [
    "a@x.com,b@evil.com",
    "a@x.com;b@evil.com",
    "a@x.com\r\nBcc: b@evil.com",
    "Name <a@x.com>",
  ]) {
    const result = await deliver(
      {},
      {
        channel: "email",
        provider: "smtp",
        stepKey: "k",
        recipientId: "r",
        to,
      },
    );
    assert.equal(result.ok, false, to);
    assert.equal(result.retryable, false);
  }
});

test("only the display name of From can be overridden", () => {
  process.env.EMAIL_FROM = "Team <team@example.com>";
  process.env.EMAIL_REPLY_TO = "Inbox <reply@replies.example.com>";
  assert.deepEqual(emailHeaders({}), {
    from: "Team <team@example.com>",
    replyTo: "Inbox <reply@replies.example.com>",
  });
  assert.equal(
    emailHeaders({ senderName: "Asha at Acme" }).from,
    '"Asha at Acme" <team@example.com>',
  );
  process.env.EMAIL_FROM = "team@example.com";
  assert.equal(
    emailHeaders({ senderName: "Asha" }).from,
    '"Asha" <team@example.com>',
  );
});

test("a sender name that could alter headers is ignored", () => {
  process.env.EMAIL_FROM = "Team <team@example.com>";
  for (const senderName of [
    "Evil\r\nBcc: x@evil.com",
    'Evil" <x@evil.com>',
    "Evil <x@evil.com>",
    "Evil\\",
    "a".repeat(61),
  ]) {
    assert.equal(emailHeaders({ senderName }).from, "Team <team@example.com>");
  }
});

test("reply-to is one plain address, else the workspace's", () => {
  process.env.EMAIL_FROM = "Team <team@example.com>";
  process.env.EMAIL_REPLY_TO = "Inbox <reply@replies.example.com>";
  assert.equal(
    emailHeaders({ replyTo: " Asha@Acme.com " }).replyTo,
    "asha@acme.com",
  );
  for (const replyTo of [
    "a@x.com,b@evil.com",
    "a@x.com\r\nBcc: b@evil.com",
    "Name <a@x.com>",
  ]) {
    assert.equal(
      emailHeaders({ replyTo }).replyTo,
      "Inbox <reply@replies.example.com>",
    );
  }
  delete process.env.EMAIL_REPLY_TO;
  assert.equal(emailHeaders({ replyTo: "a@x.com\nb" }).replyTo, undefined);
});

test("env values are stripped of line breaks before they reach a header", () => {
  process.env.EMAIL_FROM = "Team <team@example.com>\r\nBcc: x@evil.com";
  assert.doesNotMatch(emailHeaders({}).from, /[\r\n]/);
});

test("replies count as tracked only for the workspace address", () => {
  process.env.EMAIL_REPLY_TO = "Inbox <Reply@replies.example.com>";
  assert.equal(repliesTracked(undefined), true);
  assert.equal(repliesTracked("reply@replies.example.com"), true);
  assert.equal(repliesTracked("asha@acme.com"), false);
  delete process.env.EMAIL_REPLY_TO;
  assert.equal(repliesTracked("asha@acme.com"), false);
});
