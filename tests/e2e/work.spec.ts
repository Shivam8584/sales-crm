import { expect, test, type Page } from "@playwright/test";
import { open, session, undoToast } from "./helpers";

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await session(browser, "admin", {
    viewport: { width: 1360, height: 900 },
    acceptDownloads: true,
  });
});
test.afterAll(() => page.context().close());

const cursor = () =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-today-row]")];
    return {
      total: rows.length,
      index: rows.findIndex(
        (row) => row.getAttribute("data-cursor") === "true",
      ),
    };
  });

test.describe("Today", () => {
  test("j and k move the cursor, x completes a task and Ctrl+Z brings it back", async () => {
    await open(page, "/today");
    await expect(page.locator("[data-today-row]").first()).toBeVisible();
    await page.locator("body").click({ position: { x: 640, y: 5 } });

    await page.keyboard.press("j");
    const first = (await cursor()).index;
    await page.keyboard.press("j");
    expect((await cursor()).index).toBe(first + 1);
    await page.keyboard.press("k");
    expect((await cursor()).index).toBe(first);

    const onTask = () =>
      page.evaluate(() => {
        const row = document.querySelector(
          '[data-today-row][data-cursor="true"]',
        );
        return Boolean(row?.querySelector('[aria-label^="Complete"]'));
      });
    for (let i = 0; i < 15 && !(await onTask()); i++) {
      await page.keyboard.press("j");
    }
    test.skip(!(await onTask()), "no open task on Today to complete");

    const { total } = await cursor();
    await page.keyboard.press("x");
    await expect(page.getByText(/^Completed “/)).toBeVisible();
    await page.keyboard.press("Control+z");
    await expect(page.getByText(/^Completed “/)).toHaveCount(0);
    await expect.poll(async () => (await cursor()).total).toBe(total);
  });
});

test.describe("deals board", () => {
  test("dragging a card to another column moves it, and dragging it back restores the board", async () => {
    await open(page, "/pipeline/deals");
    const column = (id: string) => page.locator(`[data-column-id="${id}"]`);
    const cards = (id: string) => column(id).locator("[data-board-card]");
    await expect(cards("discovery").first()).toBeVisible();
    const [discoveryBefore, demoBefore] = [
      await cards("discovery").count(),
      await cards("demo").count(),
    ];
    const label = (await cards("discovery")
      .first()
      .getAttribute("aria-label"))!;

    const drag = async (from: string, to: string) => {
      const card = column(from).locator(
        `[data-board-card][aria-label="${label}"]`,
      );
      const start = (await card.boundingBox())!;
      const target = (await column(to).boundingBox())!;
      await page.mouse.move(start.x + 40, start.y + 20);
      await page.mouse.down();
      await page.mouse.move(start.x + 60, start.y + 40, { steps: 5 });
      await page.mouse.move(target.x + target.width / 2, target.y + 140, {
        steps: 20,
      });
      await page.mouse.up();
    };

    await drag("discovery", "demo");
    await expect(cards("demo")).toHaveCount(demoBefore + 1);
    await expect(cards("discovery")).toHaveCount(discoveryBefore - 1);
    await drag("demo", "discovery");
    await expect(cards("demo")).toHaveCount(demoBefore);
    await expect(cards("discovery")).toHaveCount(discoveryBefore);
  });
});

test.describe("tasks", () => {
  test("pasted lines become tasks with priority and due date, and undo removes them", async () => {
    const marker = `e2e-${Date.now()}`;
    await open(page, "/tasks");
    await page
      .getByRole("button", { name: "Task list actions" })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /Paste tasks/ }).click();
    const dialog = page.getByRole("dialog").last();
    await dialog
      .locator("textarea")
      .fill(
        `- ${marker} call about renewal !high @tomorrow\n2. ${marker} send deck @2026-10-30\n${marker} plain line`,
      );
    await expect(dialog).toContainText(/3 tasks?/i);
    await expect(dialog).toContainText("High");
    await dialog
      .getByRole("button", { name: /^Add|Create|Import/ })
      .last()
      .click();
    await expect(page.getByText(/Added 3 tasks/)).toBeVisible();
    await expect(page.getByText(marker)).toHaveCount(3);
    await undoToast(page).click();
    await expect(page.getByText(marker)).toHaveCount(0);
  });
});

test.describe("sequences", () => {
  test("a sequence exports as JSON: preview, then download", async () => {
    await open(page, "/automation/sequences");
    await page.locator("[role=row] a[href^='/automation/sequences/']").first().click();
    await expect(page).toHaveURL(/\/automation\/sequences\/\w+/);
    await page
      .getByRole("button", { name: "Automation actions" })
      .first()
      .click();
    await page.getByRole("menuitem", { name: /Export/ }).click();
    const dialog = page.getByRole("dialog").last();
    await expect(dialog).toContainText(/"format": ?1|hypedrive-crm/);
    const download = page.waitForEvent("download");
    await dialog.getByRole("button", { name: /Download/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
    await page.keyboard.press("Escape");
  });
});
