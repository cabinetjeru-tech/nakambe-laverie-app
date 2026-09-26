// Génère les icônes PNG de l'application à partir des logos SVG.
// Nécessite playwright-core et un Chromium : 
//   PLAYWRIGHT_CORE=/chemin/node_modules/playwright-core CHROMIUM=/chemin/chrome node scripts/generate-icons.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? 'playwright-core');
const pub = resolve('public');
const jobs = [
  ['logo.svg', 'icons/icon-192.png', 192],
  ['logo.svg', 'icons/icon-512.png', 512],
  ['logo-maskable.svg', 'icons/icon-maskable-512.png', 512],
  ['logo-maskable.svg', 'icons/apple-touch-icon.png', 180],
  ['logo.svg', 'icons/favicon-32.png', 32],
  ['logo-livreur-maskable.svg', 'icons/livreur-192.png', 192],
  ['logo-livreur-maskable.svg', 'icons/livreur-512.png', 512],
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM });
const page = await browser.newPage();
for (const [svg, out, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const content = readFileSync(join(pub, svg), 'utf8').replace('<svg ', `<svg width="${size}" height="${size}" style="display:block" `);
  await page.setContent(`<html><body style="margin:0;background:transparent">${content}</body></html>`);
  await page.screenshot({ path: join(pub, out), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`✔ ${out}`);
}
await browser.close();
