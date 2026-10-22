import { expect, test, type Page } from "@playwright/test";
import { open, rowAt, rowText, session, undoToast } from "./helpers";

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await session(browser, "admin", {
    viewport: { width: 1360, height: 900 },
  });
});
test.afterAll(() => page.context().close());

const stageTrigger = (row = 0) =>
  rowAt(page, row).locator("button[aria-label^='Stage:']").first();

test.describe("accounts list", () => {
  test.beforeEach(async () => {
    await open(page, "/records/accounts?sort=name:asc");
    await expect(rowAt(page, 1)).toBeVisible();
  });

  test("Enter on a row picker opens it without opening the record", async () => {
    const trigger = page.locator('button[aria-label^="Stage:"]').first();
    await trigger.focus();
    const before = page.url();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-slot=popover-content]")).toBeVisible();
    expect(page.url()).toBe(before);
    await page.keyboard.press("Escape");
  });

  test("clicking a row opens the record", async () => {
    await rowAt(page, 0)
      .locator("[role=cell]")
      .nth(1)
      .click({ position: { x: 4, y: 4 } });
    await expect(page).toHaveURL(/\/records\/accounts\/\w+/);
  });

  test("saved views can be saved and deleted", async () => {
    const name = "e2e view";
    await open(page, "/records/accounts?stage=live");
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.locator('input[aria-label="View name"]').fill(name);
    await page.keyboard.press("Enter");
    const saved = page.getByRole("button", { name, exact: true });
    await expect(saved).toBeVisible();
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await expect(saved).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("a row's stage can be changed inline and undone from the toast", async () => {
    const was = await stageTrigger().getAttribute("aria-label");
    await stageTrigger().click();
    const options = page.locator("[data-slot=popover-content] [cmdk-item]");
    const count = await options.count();
    let target = -1;
    for (let i = 0; i < count; i++) {
      const label = (await options.nth(i).innerText()).trim();
      if (!was!.includes(label)) {
        target = i;
        break;
      }
    }
    await options.nth(target).click();
    await expect(stageTrigger()).not.toHaveAttribute("aria-label", was!);
    await undoToast(page).click();
    await expect(stageTrigger()).toHaveAttribute("aria-label", was!);
  });

  test("bulk set stage hits every selected row and undo restores both", async () => {
    const before = [
      await rowText(rowAt(page, 0)),
      await rowText(rowAt(page, 1)),
    ];
    await rowAt(page, 0).locator("[role=checkbox]").click();
    await rowAt(page, 1).locator("[role=checkbox]").click();
    const bar = page.getByRole("toolbar", { name: "Selection actions" });
    await bar.getByRole("button", { name: /Set stage/ }).click();
    const options = page.locator("[data-slot=popover-content] [cmdk-item]");
    const labels = await options.allInnerTexts();
    const stage = labels.find((label) => !before[0].includes(label.trim()))!;
    await options.filter({ hasText: stage.trim() }).first().click();
    await expect(page.getByText(/Stage updated · 2 records/)).toBeVisible();
    await undoToast(page).click();
    await expect.poll(() => rowText(rowAt(page, 0))).toBe(before[0]);
    await expect.poll(() => rowText(rowAt(page, 1))).toBe(before[1]);
  });

  test("bulk add tag tags every selected row and undo removes it", async () => {
    const tag = "e2e-tag";
    const tagsOf = async (index: number) => {
      await rowAt(page, index)
        .locator('button[aria-label="Tags: edit"]')
        .first()
        .click();
      const text = await page
        .locator("[data-slot=popover-content]")
        .last()
        .innerText();
      await page.keyboard.press("Escape");
      return text;
    };
    await rowAt(page, 0).locator("[role=checkbox]").click();
    await rowAt(page, 1).locator("[role=checkbox]").click();
    await page
      .getByRole("toolbar", { name: "Selection actions" })
      .getByRole("button", { name: /Add tag/ })
      .click();
    await page.locator('input[aria-label="Tag name"]').fill(tag);
    await page.keyboard.press("Enter");
    await expect.poll(() => tagsOf(0)).toContain(tag);
    expect(await tagsOf(1)).toContain(tag);
    await undoToast(page).click();
    await expect.poll(() => tagsOf(0)).not.toContain(tag);
    expect(await tagsOf(1)).not.toContain(tag);
  });
});

test.describe("account page", () => {
  test("pinning shows it in the sidebar and Ctrl+Z unpins", async () => {
    await open(page, "/records/accounts");
    const href = await page
      .locator('[role=row] a[href^="/records/accounts/"]')
      .first()
      .getAttribute("href");
    await open(page, href!);
    await page.getByRole("button", { name: "Account actions" }).click();
    await page.getByRole("menuitem", { name: /Pin to sidebar/ }).click();
    const pinned = page.getByText("Pinned", { exact: true });
    await expect(pinned).toBeVisible();
    await page.locator("body").click({ position: { x: 5, y: 300 } });
    await page.keyboard.press("Control+z");
    await expect(pinned).toHaveCount(0);
  });
});
