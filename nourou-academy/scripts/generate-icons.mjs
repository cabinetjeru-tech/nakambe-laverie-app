// Génère les icônes PNG de la PWA à partir des SVG de public/icons.
// Usage : PLAYWRIGHT_CORE=<chemin vers playwright-core> CHROMIUM=<chemin chrome> node scripts/generate-icons.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const dir = resolve("public/icons");
const jobs = [
  ["logo.svg", "icon-192.png", 192],
  ["logo.svg", "icon-512.png", 512],
  ["logo-maskable.svg", "icon-maskable-512.png", 512],
  ["logo-maskable.svg", "apple-touch-icon.png", 180],
  ["logo.svg", "favicon-32.png", 32],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
for (const [svg, out, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const content = readFileSync(join(dir, svg), "utf8").replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${content}</body></html>`);
  await page.screenshot({ path: join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`✔ ${out}`);
}
await browser.close();
