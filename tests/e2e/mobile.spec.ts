import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, open, session } from "./helpers";

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await session(browser, "rep", {
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
});
test.afterAll(() => page.context().close());

for (const route of [
  "/records/accounts",
  "/records/people",
  "/pipeline/leads",
  "/pipeline/deals",
  "/tasks",
  "/pipeline/prospecting",
  "/automation/sequences",
]) {
  test(`${route} keeps its filters in one sheet at 390px`, async () => {
    await open(page, route);
    const button = page.getByRole("button", { name: /^Filters/ });
    await expect(button.first()).toBeVisible();
    await expect(
      page.locator("[data-slot=page-toolbar] button[aria-haspopup=menu]"),
    ).toHaveCount(0);
    await button.first().click();
    const sheet = page.getByRole("dialog").last();
    await expect(
      sheet.locator("button[aria-haspopup=menu]").first(),
    ).toBeVisible();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await sheet.getByRole("button", { name: /^Done/ }).click();
  });
}

test("the drawer opens from the header and closes after navigating", async () => {
  await open(page, "/today");
  await page.getByRole("button", { name: "Open navigation" }).click();
  const link = page.getByRole("link", { name: /Leads/ }).first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/pipeline\/leads/);
  await expect(
    page.getByRole("link", { name: /Playbook/ }).filter({ visible: true }),
  ).toHaveCount(0);
});
