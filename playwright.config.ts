import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(baseURL);
if (!local && process.env.E2E_ALLOW_REMOTE !== "1") {
  throw new Error(
    `E2E_BASE_URL ${baseURL} is not local. The suite changes data and signs in with the seeded logins; set E2E_ALLOW_REMOTE=1 to override.`,
  );
}

export default defineConfig({
  testDir: "tests/e2e",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: "list",
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: { executablePath: process.env.E2E_CHROMIUM || undefined },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
