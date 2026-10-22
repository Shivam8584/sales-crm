import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, open, session, watchErrors } from "./helpers";

const ROUTES = [
  "/today",
  "/inbox",
  "/tasks",
  "/pipeline/prospecting",
  "/pipeline/leads",
  "/pipeline/deals",
  "/pipeline/activation",
  "/automation/sequences",
  "/records/accounts",
  "/records/people",
  "/insights/activity",
  "/insights/reports",
  "/insights/playbook",
  "/settings/profile",
  "/settings/workspace",
  "/settings/team",
  "/settings/integrations",
  "/settings/fields",
  "/settings/duplicates",
  "/settings/targets",
  "/settings/system",
];

const SIZES = [
  { name: "1280", width: 1280, height: 800 },
  { name: "390", width: 390, height: 844 },
];

// The feed is ordered by creation time but grouped by occurrence day, so backdated seed rows can repeat a day group and React warns about its key.
const tolerated = (route: string, error: string) =>
  route === "/insights/activity" && error.includes("two children with the same key");

let page: Page;
let errors: string[];

test.beforeAll(async ({ browser }) => {
  page = await session(browser, "admin");
  errors = watchErrors(page);
});
test.afterAll(() => page.context().close());

for (const route of ROUTES) {
  test(`${route} renders without errors or horizontal overflow`, async () => {
    errors.length = 0;
    for (const size of SIZES) {
      await page.setViewportSize(size);
      await open(page, route);
      await page.waitForLoadState("networkidle");
      expect(
        await horizontalOverflow(page),
        `overflow at ${size.name}px`,
      ).toBeLessThanOrEqual(0);
    }
    expect(errors.filter((error) => !tolerated(route, error))).toEqual([]);
  });
}
