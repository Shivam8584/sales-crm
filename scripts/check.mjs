// The production gate. ESLint is the slowest step and independent of the rest,
// so it runs beside the type check and tests; two lanes keep peak memory low.
import { spawn } from "node:child_process";

function run(label, command) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, { shell: true });
    const out = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => out.push(chunk));
    child.on("close", (code) => {
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      process.stdout.write(
        `\n${code === 0 ? "ok" : "FAILED"}  ${label} (${seconds}s)\n${Buffer.concat(out)}`,
      );
      resolve(code === 0);
    });
  });
}

async function lane(steps) {
  for (const [label, command] of steps) {
    if (!(await run(label, command))) return false;
  }
  return true;
}

const results = await Promise.all([
  lane([["eslint", "eslint --cache --cache-strategy content"]]),
  lane([
    ["next typegen", "next typegen"],
    ["tsc", "tsc --noEmit"],
    ["node tests", "npm run --silent test"],
    ["convex tests", "npm run --silent test:convex"],
  ]),
]);
process.exit(results.every(Boolean) ? 0 : 1);
