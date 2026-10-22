import { expect, test, type Page } from "@playwright/test";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { clientFor } from "./convex";
import { open, session } from "./helpers";

test.describe.configure({ mode: "serial" });

test.describe("as a rep", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await session(browser, "rep");
  });
  test.afterAll(() => page.context().close());

  test("sees no Export button on the record lists", async () => {
    for (const route of ["/accounts", "/people", "/leads", "/deals"]) {
      await open(page, route);
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("button", { name: "Export" }),
        route,
      ).toHaveCount(0);
    }
  });

  test("is kept out of the system page", async () => {
    await page.goto("/settings/system");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "Services" })).toHaveCount(
      0,
    );
  });

  test("gets a plain step list, not the canvas, from a sequence template", async () => {
    await open(page, "/automations");
    await page.getByRole("tab", { name: "Templates" }).click();
    await page.getByRole("button", { name: "Use template" }).first().click();
    await expect(page).toHaveURL(/\/automations\/\w+/);
    const id = page.url().split("/").pop()!;
    try {
      await expect(page.getByRole("tab", { name: "Steps" })).toBeVisible();
      await expect(
        page.locator('[aria-roledescription="workflow canvas"]'),
      ).toHaveCount(0);
    } finally {
      const rep = await clientFor("rep");
      await rep.mutation(api.automations.remove, {
        id: id as Id<"automations">,
      });
    }
  });
});

test.describe("as an admin", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await session(browser, "admin");
  });
  test.afterAll(() => page.context().close());

  test("sees Export on the accounts list", async () => {
    await open(page, "/accounts");
    await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  });

  test("sees the system page", async () => {
    await open(page, "/settings/system");
    await expect(page.getByRole("heading", { name: "Services" })).toBeVisible();
  });
});

test.describe("public files and headers", () => {
  test("the web manifest points installs at Today", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.start_url).toBe("/today");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
  });

  test("the service worker is never cached", async ({ request }) => {
    const response = await request.get("/sw.js");
    expect(response.ok()).toBe(true);
    expect(response.headers()["cache-control"]).toMatch(/no-cache/);
  });

  test("the offline page is served", async ({ request }) => {
    const response = await request.get("/offline");
    expect(await response.text()).toMatch(/offline/i);
  });

  test("the app refuses framing but the demo embed allows it", async ({
    request,
  }) => {
    const app = await request.get("/today");
    const embed = await request.get("/demo?embed=1");
    expect(app.headers()["x-frame-options"]).toBe("DENY");
    expect(embed.headers()["x-frame-options"]).toBeUndefined();
  });
});
