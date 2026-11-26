// Test de fumée navigateur (Playwright) : nécessite API + web lancés et la base de démonstration.
// Usage : PWD1=<mot de passe propriétaire> node apps/web/tests/ui-smoke.js
const { chromium } = require('playwright');
const SHOTS = process.env.SHOTS ?? "/tmp/dread-royal-shots"; require("fs").mkdirSync(SHOTS, { recursive: true });
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push(`[console] ${page.url()} ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`[pageerror] ${page.url()} ${e.message}`));
  page.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) problems.push(`[api ${r.status()}] ${r.url()}`); });

  await page.goto('http://localhost:3000/login/');
  await page.screenshot({ path: `${SHOTS}/00-login.png` });
  await page.fill('input[autocomplete=username]', 'proprietaire');
  await page.fill('input[autocomplete=current-password]', process.env.PWD1);
  await page.click('button[type=submit]');
  await page.waitForTimeout(1500);
  if (page.url().includes('mon-compte')) {
    const inputs = page.locator('input[type=password]');
    await inputs.nth(0).fill(process.env.PWD1);
    await inputs.nth(1).fill('Couronne2026');
    await inputs.nth(2).fill('Couronne2026');
    await page.click('button[type=submit]');
    await page.waitForTimeout(1500);
  }
  const pages = ['/', '/rendez-vous/', '/vente/', '/ventes/', '/caisse/', '/clients/', '/prestations/', '/personnel/', '/commissions/', '/fidelite/', '/depenses/', '/finances/', '/stock/', '/achats/', '/rapports/', '/utilisateurs/', '/journal/', '/parametres/', '/synchronisation/', '/mon-compte/'];
  for (const [i, p] of pages.entries()) {
    await page.goto(`http://localhost:3000${p}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    const name = `${String(i + 1).padStart(2, '0')}-${p.replace(/\//g, '') || 'dashboard'}.png`;
    await page.screenshot({ path: `${SHOTS}/${name}`, fullPage: false });
  }
  // Fiche client et détail de vente
  await page.goto('http://localhost:3000/clients/');
  await page.waitForLoadState('networkidle');
  await page.locator('tbody tr').first().click();
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/30-client-fiche.png` });
  await page.goto('http://localhost:3000/ventes/');
  await page.waitForLoadState('networkidle');
  await page.locator('tbody tr').first().click();
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/31-vente-detail.png` });

  // Parcours de vente complet dans la caisse enregistreuse
  await page.goto('http://localhost:3000/vente/');
  await page.waitForLoadState('networkidle');
  await page.getByText('Coupe dégradée (fade / taper)').click();
  await page.locator('select').filter({ hasText: '— Coiffeur —' }).selectOption({ label: 'Salif TRAORÉ' });
  await page.getByRole('button', { name: 'Produits' }).click();
  await page.getByText('Peigne afro en bois').click();
  const amount = page.getByPlaceholder('Montant');
  await page.getByRole('button', { name: 'Solde' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/32-pos.png`, fullPage: true });
  await page.getByRole('button', { name: 'Valider la vente' }).click();
  await page.waitForURL(/ventes\/detail/, { timeout: 10000 });
  await page.waitForLoadState('networkidle'); await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/33-vente-creee.png` });
  const title = await page.locator('h1').textContent();
  console.log('Vente créée :', title);

  // Mobile
  const m = await browser.newContext({ ...require('playwright').devices['Pixel 7'] });
  const mp = await m.newPage();
  mp.on('pageerror', (e) => problems.push(`[mobile pageerror] ${e.message}`));
  await mp.goto('http://localhost:3000/login/');
  await mp.screenshot({ path: `${SHOTS}/40-mobile-login.png` });
  await mp.fill('input[autocomplete=username]', 'proprietaire');
  await mp.fill('input[autocomplete=current-password]', 'Couronne2026');
  await mp.click('button[type=submit]');
  await mp.waitForTimeout(2500);
  await mp.screenshot({ path: `${SHOTS}/41-mobile-dashboard.png` });
  await mp.click('button[aria-label="Ouvrir le menu"]');
  await mp.waitForTimeout(400);
  await mp.screenshot({ path: `${SHOTS}/42-mobile-menu.png` });
  await mp.goto('http://localhost:3000/rendez-vous/');
  await mp.waitForLoadState('networkidle'); await mp.waitForTimeout(600);
  await mp.screenshot({ path: `${SHOTS}/43-mobile-rdv.png` });

  // Coiffeur : menu restreint
  const s = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const sp = await s.newPage();
  await sp.goto('http://localhost:3000/login/');
  await sp.fill('input[autocomplete=username]', 'aziz');
  await sp.fill('input[autocomplete=current-password]', 'Demo2026!');
  await sp.click('button[type=submit]');
  await sp.waitForTimeout(2500);
  await sp.screenshot({ path: `${SHOTS}/50-coiffeur.png` });
  const nav = await sp.locator('aside nav a').allTextContents();
  console.log('Menu coiffeur :', nav.join(' | '));

  console.log(problems.length ? 'PROBLÈMES:\n' + [...new Set(problems)].join('\n') : 'Aucune erreur console/API');
  await browser.close();
})().catch((e) => { console.error('ECHEC', e); process.exit(1); });
