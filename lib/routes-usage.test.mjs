import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRS = ["app", "components", "convex", "features", "hooks", "lib", "stores", "tests"];
const SKIP_DIRS = new Set(["_generated", "node_modules"]);
const SOURCE = /\.(ts|tsx|mjs)$/;

// Public Convex HTTP endpoints are not pages; the route map and its tests assert literal URLs on purpose.
const ALLOWED = new Set([
  "convex/http.ts",
  "lib/routes.ts",
  "lib/routes.test.mjs",
  "lib/routes-usage.test.mjs",
  "lib/domain/notifications.test.mjs",
]);

const AREAS =
  "today|inbox|tasks|pipeline|records|insights|automations?|settings|leads|deals|accounts|people|reports|activity|playbook|prospecting|activation|team";
const RAW_PATH = new RegExp(`["'\`]/(?:(?:${AREAS})(?![\\w-])|\\$\\{)`);

function sources(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP_DIRS.has(entry.name) ? [] : sources(path);
    return SOURCE.test(entry.name) ? [path] : [];
  });
}

test("in-app paths come from lib/routes.ts", () => {
  const offenders = [];
  for (const name of DIRS.flatMap(sources)) {
    if (ALLOWED.has(name)) continue;
    readFileSync(join(ROOT, name), "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (/^\s*(\/\/|\/?\*)/.test(line)) return;
        if (RAW_PATH.test(line)) offenders.push(`${name}:${index + 1}  ${line.trim()}`);
      });
  }
  assert.deepEqual(offenders, [], "use routes.* from lib/routes.ts instead of a path literal");
});
