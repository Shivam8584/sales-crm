// Regenerates icons.js from the app's own icon set, so the board and the app draw the same glyphs.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../../../public/assets/icons/", import.meta.url).pathname;
const icons = {};
for (const dir of ["", "automations", "kanban"]) {
  for (const file of readdirSync(join(root, dir))) {
    if (!file.endsWith(".svg")) continue;
    const svg = readFileSync(join(root, dir, file), "utf8");
    const viewBox = svg.match(/viewBox="([^"]+)"/)[1];
    const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/\s+id="[^"]*"/g, "").trim();
    const name = (dir ? `${dir}/` : "") + file.replace(/\.svg$/, "");
    icons[name] = { viewBox, inner };
  }
}
writeFileSync(new URL("icons.js", import.meta.url), `window.ICONS=${JSON.stringify(icons)};\n`);
console.log(Object.keys(icons).length, "icons");
