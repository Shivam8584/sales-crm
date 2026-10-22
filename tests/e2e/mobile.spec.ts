import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, open, session } from "./helpers";
import { routes } from "../../lib/routes";

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
  routes.accounts,
  routes.people,
  routes.leads,
  routes.deals,
  routes.tasks,
  routes.prospecting,
  routes.sequences,
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

test("the tab bar reaches every section through More", async () => {
  await open(page, routes.today);
  await page.getByRole("button", { name: "More" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("link", { name: /Playbook/ }).click();
  await expect(page).toHaveURL(new RegExp(routes.playbook));
});
