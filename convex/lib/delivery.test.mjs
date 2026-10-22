import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { deliver, emailProvider, smtpFailure } from "./automations/delivery.ts";

const SMTP_ENV = {
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_USER: "user",
  SMTP_PASSWORD: "secret",
  EMAIL_FROM: "Team <team@example.com>",
};

afterEach(() => {
  for (const key of Object.keys(SMTP_ENV)) delete process.env[key];
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
