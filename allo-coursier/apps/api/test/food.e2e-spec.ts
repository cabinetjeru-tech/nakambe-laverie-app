/**
 * Tests de bout en bout de la phase 2 : commerces partenaires, menu, panier, commande de repas,
 * acceptation et préparation par le commerçant, livraison, argent du commerçant et reversements.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { FoodService } from '../src/modules/orders/food.service';
import { auth, configureTestEnv, createTestApp, resetTestDatabase } from './helpers';

configureTestEnv();

const DROPOFF = { lat: 12.3905, lng: -1.4952, landmark: 'Face à la station, 2e étage', contactName: 'Paul Kaboré', contactPhone: '70 33 44 55' };

interface MenuProduct {
  id: string;
  name: string;
  price: number;
  optionGroups: { id: string; name: string; options: { id: string; name: string; extraPrice: number }[] }[];
}

describe('API ALLÔ-COURSIER — restaurants et commerçants (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let client: string;
  let driver: string;
  let merchant: string;
  let merchantId: string;
  let products: MenuProduct[];

  const login = async (phone: string, secret: string) => {
    const res = await http.post('/api/v1/auth/login').send({ phone, secret });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; user: { id: string } };
  };
  const product = (name: string) => products.find((p) => p.name === name)!;
  const option = (productName: string, optionName: string) =>
    product(productName).optionGroups.flatMap((g) => g.options).find((o) => o.name === optionName)!.id;

  /** 2 riz gras au poulet avec œuf (2 × 2 200) + 1 bissap (500) = 4 900 FCFA d'articles. */
  const cart = () => [
    { productId: product('Riz gras').id, quantity: 2, optionIds: [option('Riz gras', 'Poulet'), option('Riz gras', 'Œuf')], note: 'Bien pimenté' },
    { productId: product('Jus de bissap (50 cl)').id, quantity: 1 },
  ];
  const order = (body: Record<string, unknown> = {}) =>
    http.post('/api/v1/orders/food').set(auth(client)).send({ merchantId, items: cart(), dropoff: DROPOFF, paymentMethod: 'CASH', ...body });
  const mo = (path: string) => `/api/v1/merchant/${merchantId}/${path}`;
  const act = (orderId: string, action: string) => http.post(`/api/v1/driver/missions/${orderId}/action`).set(auth(driver)).send({ action });
  const offers = async () => (await http.get('/api/v1/driver/offers').set(auth(driver))).body as { offerId: string; orderId: string; amountToCollect: number }[];

  beforeAll(async () => {
    await resetTestDatabase();
    ({ app, http } = await createTestApp());
    admin = (await login('70000000', 'AlloAdmin@2026')).accessToken;
    client = (await login('76000001', '482913')).accessToken;
    driver = (await login('76000002', '482913')).accessToken;
    merchant = (await login('76000003', '482913')).accessToken;
    const memberships = await http.get('/api/v1/merchant/memberships').set(auth(merchant));
    expect(memberships.body[0]).toMatchObject({ role: 'OWNER', status: 'ACTIVE' });
    merchantId = memberships.body[0].id;
    // Ouvert quelle que soit l'heure à laquelle les tests tournent.
    await http.put(mo('open')).set(auth(merchant)).send({ isOpenOverride: true }).expect(200);
    await http.post('/api/v1/driver/online').set(auth(driver)).send({ online: true, lat: 12.365, lng: -1.534 }).expect(200);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('vitrine publique', () => {
    it('liste les restaurants ouverts et affiche le menu avec ses options', async () => {
      const list = await http.get('/api/v1/merchants');
      expect(list.status).toBe(200);
      expect(list.body.map((m: { slug: string }) => m.slug)).toContain('maquis-le-baobab-demo');
      const menu = await http.get('/api/v1/merchants/maquis-le-baobab-demo');
      expect(menu.body.isOpen).toBe(true);
      products = menu.body.products;
      expect(product('Riz gras').optionGroups.map((g) => g.name)).toEqual(expect.arrayContaining(['Viande', 'Suppléments']));
    });

    it('calcule le panier côté serveur et refuse les choix invalides', async () => {
      const quote = await http.post('/api/v1/orders/food/quote').send({ merchantId, items: cart(), dropoff: { lat: DROPOFF.lat, lng: DROPOFF.lng } });
      expect(quote.status).toBe(200);
      expect(quote.body.itemsSubtotal).toBe(4900);
      expect(quote.body.lines[0]).toMatchObject({ unitPrice: 2200, quantity: 2 });
      expect(quote.body.standard.total).toBe(4900 + quote.body.standard.deliveryFee);

      const noMeat = await http.post('/api/v1/orders/food/quote').send({ merchantId, items: [{ productId: product('Riz gras').id, quantity: 1 }], dropoff: { lat: DROPOFF.lat, lng: DROPOFF.lng } });
      expect(noMeat.status).toBe(400);
      expect(noMeat.body.message).toMatch(/choisissez viande/);
      const tooMany = await http.post('/api/v1/orders/food/quote').send({
        merchantId,
        items: [{ productId: product('Riz gras').id, quantity: 1, optionIds: [option('Riz gras', 'Bœuf'), option('Riz gras', 'Poulet')] }],
        dropoff: { lat: DROPOFF.lat, lng: DROPOFF.lng },
      });
      expect(tooMany.status).toBe(400);
      const foreign = await http.post('/api/v1/orders/food/quote').send({
        merchantId,
        items: [{ productId: product('Riz gras').id, quantity: 1, optionIds: [option('Riz gras', 'Bœuf'), option('Poulet braisé', 'Frites')] }],
        dropoff: { lat: DROPOFF.lat, lng: DROPOFF.lng },
      });
      expect(foreign.status).toBe(400);
    });

    it('applique le minimum de commande et refuse un commerce fermé', async () => {
      const small = await order({ items: [{ productId: product('Eau minérale (1,5 L)').id, quantity: 1 }] });
      expect(small.status).toBe(400);
      expect(small.body.message).toMatch(/minimum/);
      await http.put(mo('open')).set(auth(merchant)).send({ isOpenOverride: false }).expect(200);
      expect((await order()).status).toBe(400);
      await http.put(mo('open')).set(auth(merchant)).send({ isOpenOverride: true }).expect(200);
    });
  });

  describe('commande payée en espèces : du restaurant à la porte', () => {
    let orderId: string;
    let deliveryCode: string;
    let total: number;

    it('la commande attend l’accord du commerçant, sans livreur cherché', async () => {
      const res = await order().set('Idempotency-Key', 'food-test-00001');
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ status: 'CREATED', merchantStatus: 'PENDING', itemsSubtotal: 4900 });
      expect(res.body.items).toHaveLength(2);
      orderId = res.body.id;
      deliveryCode = res.body.deliveryCode;
      total = res.body.totalAmount;
      expect(total).toBe(4900 + res.body.deliveryFee);
      expect((await order().set('Idempotency-Key', 'food-test-00001')).body.id).toBe(orderId);
      expect(await offers()).toHaveLength(0);

      const pending = await http.get(mo('orders?view=PENDING')).set(auth(merchant));
      expect(pending.body.items.map((o: { id: string }) => o.id)).toEqual([orderId]);
      expect(pending.body.items[0].merchantEarning).toBe(4900 - 735); // commission par défaut : 15 %
      const detail = await http.get(mo(`orders/${orderId}`)).set(auth(merchant));
      expect(detail.body.deliveryCode).toBeUndefined();
      expect(detail.body.client).toEqual({ firstName: 'Awa' });

      // Un autre utilisateur n'a pas accès à l'espace de ce commerce.
      expect((await http.get(mo('orders')).set(auth(client))).status).toBe(403);
    });

    it('le commerçant accepte : le livreur est cherché, il ne peut pas partir avant que ce soit prêt', async () => {
      const accepted = await http.post(mo(`orders/${orderId}/accept`)).set(auth(merchant)).send({ prepMinutes: 5 });
      expect(accepted.status).toBe(200);
      expect(accepted.body.merchantStatus).toBe('ACCEPTED');
      expect((await http.post(mo(`orders/${orderId}/accept`)).set(auth(merchant)).send({ prepMinutes: 5 })).status).toBe(400);

      const [offer] = await offers();
      expect(offer.orderId).toBe(orderId);
      expect(offer.amountToCollect).toBe(total); // articles + livraison, encaissés à la porte
      await http.post(`/api/v1/driver/offers/${offer.offerId}/accept`).set(auth(driver)).expect(200);
      expect((await act(orderId, 'ARRIVED_PICKUP')).body.status).toBe('DRIVER_AT_PICKUP');
      const early = await act(orderId, 'PICKED_UP');
      expect(early.status).toBe(400);

      // Le client ne peut plus annuler : le repas est en préparation.
      expect((await http.post(`/api/v1/orders/${orderId}/cancel`).set(auth(client)).send({ reason: 'Trop long' })).status).toBe(400);
    });

    it('commande prête, livrée : le commerçant est crédité, le livreur doit les articles encaissés', async () => {
      const driverBefore = (await http.get('/api/v1/driver/wallet').set(auth(driver))).body.balance as number;
      expect((await http.post(mo(`orders/${orderId}/ready`)).set(auth(merchant))).body.merchantStatus).toBe('READY');
      expect((await act(orderId, 'PICKED_UP')).body.status).toBe('IN_TRANSIT');
      expect((await act(orderId, 'ARRIVED_DROPOFF')).body.status).toBe('ARRIVED_AT_DROPOFF');
      const delivered = await http.post(`/api/v1/driver/missions/${orderId}/deliver`).set(auth(driver)).send({ code: deliveryCode });
      expect(delivered.status).toBe(200);
      expect(delivered.body.status).toBe('DELIVERED');

      const wallet = await http.get(mo('wallet')).set(auth(merchant));
      expect(wallet.body.balance).toBe(4165);
      const driverAfter = (await http.get('/api/v1/driver/wallet').set(auth(driver))).body.balance as number;
      const detail = await http.get(`/api/v1/admin/orders/${orderId}`).set(auth(admin));
      // Le livreur a gardé toute la somme : il doit la commission de livraison et les articles.
      expect(driverAfter - driverBefore).toBe(-(detail.body.commissionAmount + 4900));
      expect(detail.body.merchantEarning).toBe(4165);

      const stats = await http.get(mo('stats')).set(auth(merchant));
      expect(stats.body.today).toMatchObject({ orders: 1, sales: 4900, earnings: 4165 });
      expect(stats.body.topProducts[0]).toEqual({ label: 'Riz gras', quantity: 2 });
    });
  });

  describe('refus, délai dépassé et paiement par portefeuille', () => {
    beforeAll(async () => {
      const wallet = await http.get('/api/v1/wallet').set(auth(client));
      await http.post(`/api/v1/admin/wallets/${wallet.body.id}/adjust`).set(auth(admin)).send({ amount: 20000, reason: 'Crédit de test' }).expect(200);
    });

    it('un refus du commerçant rembourse le client', async () => {
      const res = await order({ paymentMethod: 'WALLET' });
      expect(res.status).toBe(201);
      expect(res.body.paymentStatus).toBe('SUCCEEDED');
      expect((await http.get('/api/v1/wallet').set(auth(client))).body.balance).toBe(20000 - res.body.totalAmount);
      const rejected = await http.post(mo(`orders/${res.body.id}/reject`)).set(auth(merchant)).send({ reason: 'Plus de poulet' });
      expect(rejected.status).toBe(200);
      expect(rejected.body.status).toBe('CANCELLED');
      expect((await http.get('/api/v1/wallet').set(auth(client))).body.balance).toBe(20000);
      const seen = await http.get(`/api/v1/orders/${res.body.id}`).set(auth(client));
      expect(seen.body.merchantStatus).toBe('REJECTED');
    });

    it('le client peut annuler tant que le commerçant n’a pas répondu', async () => {
      const res = await order();
      await http.post(`/api/v1/orders/${res.body.id}/cancel`).set(auth(client)).send({ reason: 'Erreur de commande' }).expect(200);
    });

    it('annule automatiquement une commande restée sans réponse', async () => {
      const res = await order({ paymentMethod: 'WALLET' });
      const { PrismaService } = await import('../src/prisma/prisma.service');
      await app.get(PrismaService).$executeRaw`UPDATE orders SET "updatedAt" = now() - interval '1 hour' WHERE id = ${res.body.id}`;
      expect(await app.get(FoodService).cancelUnansweredOrders()).toBe(1);
      const seen = await http.get(`/api/v1/orders/${res.body.id}`).set(auth(client));
      expect(seen.body.status).toBe('CANCELLED');
      expect((await http.get('/api/v1/wallet').set(auth(client))).body.balance).toBe(20000);
    });

    it('un long temps de préparation retarde la recherche du livreur', async () => {
      const res = await order();
      const accepted = await http.post(mo(`orders/${res.body.id}/accept`)).set(auth(merchant)).send({ prepMinutes: 40 });
      expect(new Date(accepted.body.dispatchAfter).getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
      expect((await offers()).filter((o) => o.orderId === res.body.id)).toHaveLength(0);
      // Déclarée prête plus tôt que prévu : le livreur est cherché tout de suite.
      await http.post(mo(`orders/${res.body.id}/ready`)).set(auth(merchant)).expect(200);
      expect((await offers()).map((o) => o.orderId)).toContain(res.body.id);
    });
  });

  describe('argent du commerçant et gestion par l’équipe', () => {
    it('le propriétaire demande un reversement que l’équipe envoie', async () => {
      expect((await http.post(mo('payouts')).set(auth(merchant)).send({ amount: 99999, destinationPhone: '76000003' })).status).toBe(400);
      const payout = await http.post(mo('payouts')).set(auth(merchant)).send({ amount: 4000, destinationPhone: '76000003' });
      expect(payout.status).toBe(201);
      const list = await http.get('/api/v1/admin/payouts?status=PENDING').set(auth(admin));
      const row = list.body.items.find((p: { id: string }) => p.id === payout.body.id);
      expect(row.wallet.merchant.name).toMatch(/Baobab/);
      await http.post(`/api/v1/admin/payouts/${payout.body.id}/pay`).set(auth(admin)).send({ reference: 'OM-PAY-0001' }).expect(200);
      expect((await http.get(mo('wallet')).set(auth(merchant))).body.balance).toBe(165);
      const summary = await http.get('/api/v1/admin/finance/summary').set(auth(admin));
      expect(summary.body.owedToMerchants).toBe(165);
    });

    it('un nouveau partenaire s’inscrit, reste invisible jusqu’à sa validation', async () => {
      const cities = await http.get('/api/v1/cities');
      const tenko = cities.body.find((c: { slug: string }) => c.slug === 'tenkodogo');
      const signup = await http.post('/api/v1/partners/register').send({
        business: { name: 'Boutique Wendé', type: 'BOUTIQUE', phone: '70 11 22 33', cityId: tenko.id, lat: 11.78, lng: -0.37, landmark: 'Grand marché' },
        owner: { firstName: 'Wendé', lastName: 'Zongo', phone: '70 11 22 33', pin: '592817' },
      });
      expect(signup.status).toBe(201);
      const slugs = async () => (await http.get('/api/v1/merchants')).body.map((m: { name: string }) => m.name);
      expect(await slugs()).not.toContain('Boutique Wendé');
      const pending = await http.get('/api/v1/admin/merchants?status=PENDING').set(auth(admin));
      const created = pending.body.items.find((m: { name: string }) => m.name === 'Boutique Wendé');
      await http.patch(`/api/v1/admin/merchants/${created.id}`).set(auth(admin)).send({ status: 'ACTIVE' }).expect(200);
      expect(await slugs()).toContain('Boutique Wendé');
    });
  });
});
