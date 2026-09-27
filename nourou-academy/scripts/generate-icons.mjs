// Génère les icônes PNG de la PWA à partir de l’icône public/brand/akambi-mark.png (fond transparent).
// Usage : PLAYWRIGHT_CORE=<chemin vers playwright-core> CHROMIUM=<chemin chrome> node scripts/generate-icons.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "playwright-core");
const dir = resolve("public/icons");
const mark = `data:image/png;base64,${readFileSync(resolve("public/brand/akambi-mark.png")).toString("base64")}`;
// [fichier, taille, part occupée par l'emblème, coins arrondis]
const jobs = [
  ["icon-192.png", 192, 0.86, true],
  ["icon-512.png", 512, 0.86, true],
  ["icon-maskable-512.png", 512, 0.64, false],
  ["apple-touch-icon.png", 180, 0.8, false],
  ["favicon-32.png", 32, 0.96, false],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
for (const [out, size, ratio, rounded] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const box = Math.round(size * ratio);
  await page.setContent(
    `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;background:#fff;border-radius:${rounded ? size * 0.22 : 0}px;display:grid;place-items:center">` +
      `<img src="${mark}" style="width:${box}px;height:${box}px;object-fit:contain"></div></body></html>`,
  );
  await page.screenshot({ path: join(dir, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`✔ ${out}`);
}
await browser.close();
