import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Locator,
  type Page,
} from "@playwright/test";

export const USERS = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? "shivam@hypedrive.in",
    password: process.env.E2E_ADMIN_PASSWORD ?? "crm-ccb55666",
  },
  rep: {
    email: process.env.E2E_REP_EMAIL ?? "rep1@example.com",
    password: process.env.E2E_REP_PASSWORD ?? "crm-ccb55666",
  },
};

export const header = (page: Page) => page.locator("[data-slot=page-header]");

export async function skipTour(page: Page) {
  const tour = page.getByRole("dialog", { name: "Product tour" });
  for (let i = 0; i < 8 && (await tour.count()) > 0; i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
  }
}

export async function signIn(page: Page, who: keyof typeof USERS) {
  await page.goto("/");
  await page.locator("#auth-email").fill(USERS[who].email);
  await page.locator("#auth-password").fill(USERS[who].password);
  await page.keyboard.press("Enter");
  await expect(header(page)).toBeVisible({ timeout: 30_000 });
  await skipTour(page);
}

/**
 * One signed-in tab for a whole spec file. Convex Auth rotates the refresh
 * token on every page load and kills the session when an old one is replayed,
 * so a saved storage state can't be shared between tests.
 */
export async function session(
  browser: Browser,
  who: keyof typeof USERS,
  options: BrowserContextOptions = {},
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...options,
  });
  const page = await context.newPage();
  await signIn(page, who);
  return page;
}

/** Opens a page and waits for the app shell and its first data to settle. */
export async function open(page: Page, path: string) {
  await page.goto(path);
  await expect(header(page)).toBeVisible();
  await skipTour(page);
}

/** Uncaught errors and `console.error` calls, minus failed third-party loads. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Failed to load resource|net::ERR|favicon/i.test(text)) return;
    errors.push(text.slice(0, 200));
  });
  return errors;
}

export const horizontalOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

export const undoToast = (page: Page) =>
  page.getByRole("button", { name: /^Undo/ }).first();

export const rowAt = (page: Page, index: number) =>
  page.locator(`[role=row][data-row-index='${index}']`);

export const rowText = async (row: Locator) =>
  (await row.innerText()).replace(/\n+/g, " | ");
