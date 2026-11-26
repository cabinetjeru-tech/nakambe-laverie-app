// Test du mode hors connexion (Playwright) : création hors ligne → file → synchronisation.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 850 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:3000/login/');
  await page.fill('input[autocomplete=username]', 'proprietaire');
  await page.fill('input[autocomplete=current-password]', 'Couronne2026');
  await page.click('button[type=submit]');
  await page.waitForTimeout(2000);
  await page.goto('http://localhost:3000/clients/');
  await page.waitForLoadState('networkidle');
  // Coupure réseau
  await ctx.setOffline(true);
  const phone = '6' + String(Date.now()).slice(-7);
  await page.getByRole('button', { name: 'Nouveau client' }).click();
  const modal = page.locator('div.fixed.inset-0').last();
  const inputs = modal.locator('input');
  await inputs.nth(0).fill('Hors');
  await inputs.nth(1).fill('Ligne');
  await inputs.nth(2).fill(phone);
  await modal.getByRole('button', { name: 'Enregistrer' }).click();
  await page.waitForTimeout(1000);
  const toast = await page.locator('text=Hors connexion').first().textContent().catch(() => null);
  console.log('Toast hors ligne :', toast);
  await page.goto('http://localhost:3000/synchronisation/').catch(() => null);
  await page.waitForTimeout(800);
  const badge = await page.locator('header a[href="/synchronisation/"]').textContent();
  console.log('Indicateur hors ligne :', badge);
  // Retour du réseau
  await ctx.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(3000);
  await page.reload(); await page.waitForTimeout(1500);
  console.log('Indicateur après retour :', await page.locator('header a[href="/synchronisation/"]').textContent());
  const r = await page.evaluate(async (p) => {
    const t = localStorage.getItem('dr.access');
    const res = await fetch(`http://localhost:4000/api/clients?search=${p}`, { headers: { Authorization: `Bearer ${t}` } });
    return (await res.json()).items.map((c) => `${c.code} ${c.firstName} ${c.lastName}`);
  }, phone);
  console.log('Client sur le serveur :', r);
  await page.screenshot({ path: (process.env.SHOTS ?? '/tmp') + '/60-sync.png' });
  console.log('Erreurs JS :', errs.length ? errs : 'aucune');
  await browser.close();
})().catch((e) => { console.error('ECHEC', e); process.exit(1); });
