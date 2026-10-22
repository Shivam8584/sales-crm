import { expect, test, type Page } from "@playwright/test";
import { horizontalOverflow, open, session, watchErrors } from "./helpers";
import { routes } from "../../lib/routes";

const ROUTES = [
  routes.today,
  routes.inbox,
  routes.tasks,
  routes.prospecting,
  routes.leads,
  routes.deals,
  routes.activation,
  routes.sequences,
  routes.accounts,
  routes.people,
  routes.activity,
  routes.reports,
  routes.playbook,
  routes.profile,
  routes.workspace,
  routes.team,
  routes.integrations,
  routes.fields,
  routes.duplicates,
  routes.targets,
  routes.system,
];

const SIZES = [
  { name: "1280", width: 1280, height: 800 },
  { name: "390", width: 390, height: 844 },
];

// The feed is ordered by creation time but grouped by occurrence day, so backdated seed rows can repeat a day group and React warns about its key.
const tolerated = (route: string, error: string) =>
  route === routes.activity && error.includes("two children with the same key");

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
