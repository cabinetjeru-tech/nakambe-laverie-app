/**
 * Tests de bout en bout des lots 2 et 6 : commandes, attribution, suivi, chat, livraison,
 * argent (espèces, portefeuille, Mobile Money manuel), courses, promotions, réclamations, temps réel.
 */
import { INestApplication } from '@nestjs/common';
import { AddressInfo } from 'net';
import { io, Socket } from 'socket.io-client';
import request from 'supertest';
import { auth, configureTestEnv, createTestApp, resetTestDatabase, TINY_JPEG } from './helpers';

configureTestEnv();

const PICKUP = { lat: 12.3569, lng: -1.5352, landmark: 'Près du marché de Gounghin, portail bleu', contactName: 'Awa Ouédraogo', contactPhone: '76 00 00 01' };
const DROPOFF = { lat: 12.3905, lng: -1.4952, landmark: 'Face à la station, 2e étage', contactName: 'Paul Kaboré', contactPhone: '70 33 44 55' };

describe('API ALLÔ-COURSIER — commandes et argent (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let admin: string;
  let client: string;
  let driver: string;
  let driverId: string;

  const login = async (phone: string, secret: string) => {
    const res = await http.post('/api/v1/auth/login').send({ phone, secret });
    expect(res.status).toBe(200);
    return res.body as { accessToken: string; user: { id: string } };
  };

  const createOrder = (body: Record<string, unknown>, token = client) =>
    http.post('/api/v1/orders').set(auth(token)).send({ serviceType: 'PARCEL', pickup: PICKUP, dropoff: DROPOFF, paymentMethod: 'CASH', ...body });

  const driverOffer = async () => {
    const offers = await http.get('/api/v1/driver/offers').set(auth(driver));
    expect(offers.status).toBe(200);
    return offers.body as { offerId: string; orderId: string; driverEarning: number; amountToCollect: number }[];
  };

  const act = (orderId: string, action: string, extra: Record<string, unknown> = {}) =>
    http.post(`/api/v1/driver/missions/${orderId}/action`).set(auth(driver)).send({ action, ...extra });

  const upload = async (purpose: string, token = driver) => {
    const res = await http.post(`/api/v1/uploads/${purpose}`).set(auth(token)).attach('file', TINY_JPEG, 'photo.jpg');
    expect(res.status).toBe(201);
    return res.body as { key: string; url: string };
  };

  const driverWallet = async () => (await http.get('/api/v1/driver/wallet').set(auth(driver))).body.balance as number;

  beforeAll(async () => {
    await resetTestDatabase();
    ({ app, http } = await createTestApp());
    admin = (await login('70000000', 'AlloAdmin@2026')).accessToken;
    client = (await login('76000001', '482913')).accessToken;
    const d = await login('76000002', '482913');
    driver = d.accessToken;
    driverId = d.user.id;
    await http.put('/api/v1/admin/settings/payments.mobileMoney.orangeNumber').set(auth(admin)).send({ value: '+22670000099' }).expect(200);
    const online = await http.post('/api/v1/driver/online').set(auth(driver)).send({ online: true, lat: 12.36, lng: -1.53 });
    expect(online.status).toBe(200);
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('parcours complet d’un colis payé en espèces', () => {
    let orderId: string;
    let deliveryCode: string;
    let earning: number;

    it('crée la commande et propose la mission au livreur le plus proche', async () => {
      const res = await createOrder({ cashCollectAt: 'DROPOFF', packageDescription: 'Enveloppe' }).set('Idempotency-Key', 'cmd-test-0001');
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('SEARCHING_DRIVER');
      expect(res.body.reference).toMatch(/^AC-\d{6}-[A-Z0-9]{5}$/);
      expect(res.body.deliveryCode).toMatch(/^\d{4}$/);
      orderId = res.body.id;
      deliveryCode = res.body.deliveryCode;

      // Même clé : aucune commande en double après une coupure réseau.
      const again = await createOrder({ cashCollectAt: 'DROPOFF', packageDescription: 'Enveloppe' }).set('Idempotency-Key', 'cmd-test-0001');
      expect(again.body.id).toBe(orderId);

      const offers = await driverOffer();
      expect(offers).toHaveLength(1);
      expect(offers[0].orderId).toBe(orderId);
      expect(offers[0].amountToCollect).toBe(res.body.totalAmount);
    });

    it('le livreur accepte ; le client voit le livreur, le livreur ne voit pas le code', async () => {
      const [offer] = await driverOffer();
      const accepted = await http.post(`/api/v1/driver/offers/${offer.offerId}/accept`).set(auth(driver));
      expect(accepted.status).toBe(200);
      expect(accepted.body.status).toBe('DRIVER_ASSIGNED');
      expect(accepted.body.deliveryCode).toBeUndefined();
      expect(accepted.body.stops[0].contactPhone).toBe('+22676000001');
      earning = accepted.body.driverEarning;

      const seen = await http.get(`/api/v1/orders/${orderId}`).set(auth(client));
      expect(seen.body.driver.firstName).toBe('Issouf');
      expect(seen.body.driver.phone).toBe('+22676000002');

      // Le livreur ne peut pas se mettre hors ligne pendant une mission.
      expect((await http.post('/api/v1/driver/online').set(auth(driver)).send({ online: false })).status).toBe(400);
    });

    it('échange des messages sans doublon', async () => {
      const msg = { clientMessageId: 'msg-client-000001', type: 'TEXT', body: 'Portail bleu, sonnez deux fois' };
      const first = await http.post(`/api/v1/orders/${orderId}/messages`).set(auth(client)).send(msg);
      expect(first.status).toBe(201);
      const resend = await http.post(`/api/v1/orders/${orderId}/messages`).set(auth(client)).send(msg);
      expect(resend.body.id).toBe(first.body.id);
      await http.post(`/api/v1/orders/${orderId}/messages`).set(auth(driver)).send({ clientMessageId: 'msg-driver-00001', type: 'QUICK_REPLY', body: 'Je suis en route' }).expect(201);
      const list = await http.get(`/api/v1/orders/${orderId}/messages`).set(auth(driver));
      expect(list.body.messages.map((m: { body: string }) => m.body)).toEqual(['Portail bleu, sonnez deux fois', 'Je suis en route']);
    });

    it('suit les étapes et enregistre la trace GPS', async () => {
      expect((await act(orderId, 'ARRIVED_DROPOFF')).status).toBe(400); // pas de saut d'étape
      expect((await act(orderId, 'ARRIVED_PICKUP', { lat: 12.357, lng: -1.535 })).body.status).toBe('DRIVER_AT_PICKUP');
      expect((await act(orderId, 'PICKED_UP')).body.status).toBe('IN_TRANSIT');
      const loc = await http.post('/api/v1/driver/location').set(auth(driver)).send({
        points: [
          { lat: 12.37, lng: -1.52, recordedAt: new Date(Date.now() - 20_000).toISOString() },
          { lat: 12.38, lng: -1.51 },
        ],
      });
      expect(loc.body.received).toBe(2);
      const client_view = await http.get(`/api/v1/orders/${orderId}`).set(auth(client));
      expect(client_view.body.driver.location).toMatchObject({ lat: 12.38, lng: -1.51 });
      expect((await act(orderId, 'ARRIVED_DROPOFF')).body.status).toBe('ARRIVED_AT_DROPOFF');
    });

    it('exige le bon code de livraison puis règle l’argent', async () => {
      const wrong = await http.post(`/api/v1/driver/missions/${orderId}/deliver`).set(auth(driver)).send({ code: deliveryCode === '0000' ? '1111' : '0000' });
      expect(wrong.status).toBe(400);
      expect(wrong.body.message).toMatch(/Code incorrect/);

      const ok = await http.post(`/api/v1/driver/missions/${orderId}/deliver`).set(auth(driver)).send({ code: deliveryCode });
      expect(ok.status).toBe(200);
      expect(ok.body.status).toBe('DELIVERED');
      const commission = ok.body.commissionAmount;
      expect(ok.body.driverEarning).toBe(earning);
      expect(commission + earning).toBe(ok.body.totalAmount);

      // Espèces : le livreur garde son gain et doit la commission à la plateforme.
      expect(await driverWallet()).toBe(-commission);
      const summary = await http.get('/api/v1/admin/finance/summary').set(auth(admin));
      expect(summary.body.platformBalance).toBe(commission);
      expect(summary.body.cashHeldByDrivers).toBe(commission);
    });

    it('note le livreur et clôture la commande', async () => {
      const rate = await http.post(`/api/v1/orders/${orderId}/rating`).set(auth(client)).send({ score: 5, tags: ['Rapide'] });
      expect(rate.status).toBe(201);
      expect((await http.post(`/api/v1/orders/${orderId}/rating`).set(auth(client)).send({ score: 4 })).status).toBe(409);
      const order = await http.get(`/api/v1/orders/${orderId}`).set(auth(client));
      expect(order.body.status).toBe('COMPLETED');
      expect(order.body.deliveryCode).toBeNull();
      const profile = await http.get('/api/v1/driver/profile').set(auth(driver));
      expect(profile.body.ratingAvg).toBe(5);
    });

    it('enregistre le versement des espèces du livreur', async () => {
      const debt = -(await driverWallet());
      const res = await http.post(`/api/v1/admin/drivers/${driverId}/cash-settlements`).set(auth(admin)).send({ amount: debt, method: 'ESPECES' });
      expect(res.status).toBe(201);
      expect(res.body.balance).toBe(0);
      const earnings = await http.get('/api/v1/driver/earnings').set(auth(driver));
      expect(earnings.body.today.deliveries).toBe(1);
      expect(earnings.body.today.earnings).toBe(earning);
    });

    it('permet le suivi public par lien, sans données personnelles', async () => {
      const order = await http.get(`/api/v1/orders/${orderId}`).set(auth(client));
      const pub = await http.get(`/api/v1/track/${order.body.trackingToken}`);
      expect(pub.status).toBe(200);
      expect(pub.body.status).toBe('COMPLETED');
      expect(JSON.stringify(pub.body)).not.toContain('+226');
      expect((await http.get('/api/v1/track/jeton-inexistant-xxxxxxxx')).status).toBe(404);
    });
  });

  describe('refus, relance et affectation manuelle', () => {
    it('relance la recherche après un refus puis l’équipe affecte le livreur', async () => {
      const res = await createOrder({ speed: 'EXPRESS' });
      const orderId = res.body.id;
      const [offer] = await driverOffer();
      await http.post(`/api/v1/driver/offers/${offer.offerId}/reject`).set(auth(driver)).send({ reason: 'Trop loin' }).expect(200);
      expect(await driverOffer()).toHaveLength(0); // aucun autre livreur disponible

      const detail = await http.get(`/api/v1/admin/orders/${orderId}`).set(auth(admin));
      expect(detail.body.offers[0].status).toBe('REJECTED');

      const assigned = await http.post(`/api/v1/admin/orders/${orderId}/assign`).set(auth(admin)).send({ driverId });
      expect(assigned.status).toBe(200);
      expect(assigned.body.status).toBe('DRIVER_ASSIGNED');
      const mission = await http.get('/api/v1/driver/mission').set(auth(driver));
      expect(mission.body.id).toBe(orderId);

      const live = await http.get('/api/v1/admin/live').set(auth(admin));
      expect(live.body.drivers.find((d: { userId: string }) => d.userId === driverId).busy).toBe(true);

      // Le client ne peut plus annuler une fois le livreur sur place ; l'équipe, si.
      await act(orderId, 'ARRIVED_PICKUP').expect(200);
      expect((await http.post(`/api/v1/orders/${orderId}/cancel`).set(auth(client)).send({ reason: 'Plus besoin' })).status).toBe(400);
      const cancelled = await http.post(`/api/v1/admin/orders/${orderId}/cancel`).set(auth(admin)).send({ reason: 'Client injoignable' });
      expect(cancelled.body.status).toBe('CANCELLED');
    });

    it('expire une offre sans réponse', async () => {
      const res = await createOrder({});
      const [offer] = await driverOffer();
      const prisma = app.get((await import('../src/prisma/prisma.service')).PrismaService);
      await prisma.dispatchOffer.update({ where: { id: offer.offerId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      const { DispatchService } = await import('../src/modules/orders/dispatch.service');
      await app.get(DispatchService).expireDueOffers();
      const detail = await http.get(`/api/v1/admin/orders/${res.body.id}`).set(auth(admin));
      expect(detail.body.offers[0].status).toBe('EXPIRED');
      await http.post(`/api/v1/orders/${res.body.id}/cancel`).set(auth(client)).send({ reason: 'Test terminé' }).expect(200);
    });
  });

  describe('portefeuille et Mobile Money manuel', () => {
    it('recharge le portefeuille après vérification par l’équipe', async () => {
      const topup = await http.post('/api/v1/wallet/topups').set(auth(client)).send({ amount: 5000, operator: 'ORANGE', reference: 'OM-TOPUP-0001', payerPhone: '76000001' });
      expect(topup.status).toBe(201);
      expect((await http.post('/api/v1/wallet/topups').set(auth(client)).send({ amount: 5000, operator: 'ORANGE', reference: 'om-topup-0001', payerPhone: '76000001' })).status).toBe(409);
      await http.post(`/api/v1/admin/payments/${topup.body.id}/validate`).set(auth(admin)).expect(200);
      expect((await http.post(`/api/v1/admin/payments/${topup.body.id}/validate`).set(auth(admin))).status).toBe(400);
      const wallet = await http.get('/api/v1/wallet').set(auth(client));
      expect(wallet.body.balance).toBe(5000);
    });

    it('paie par portefeuille puis rembourse à l’annulation', async () => {
      const res = await createOrder({ paymentMethod: 'WALLET' });
      expect(res.status).toBe(201);
      expect(res.body.paymentStatus).toBe('SUCCEEDED');
      const paid = res.body.totalAmount;
      expect((await http.get('/api/v1/wallet').set(auth(client))).body.balance).toBe(5000 - paid);
      const cancel = await http.post(`/api/v1/orders/${res.body.id}/cancel`).set(auth(client)).send({ reason: 'Erreur d’adresse' });
      expect(cancel.body.refunded).toBe(paid);
      expect((await http.get('/api/v1/wallet').set(auth(client))).body.balance).toBe(5000);
    });

    it('refuse un paiement par portefeuille sans solde suffisant', async () => {
      await http.post('/api/v1/auth/register').send({ phone: '70 55 66 77', firstName: 'Fatim', lastName: 'Sana', pin: '581204', accountType: 'CLIENT' });
      const other = (await login('70556677', '581204')).accessToken;
      const res = await createOrder({ paymentMethod: 'WALLET' }, other);
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/insuffisant/);
    });

    it('attend la vérification du Mobile Money avant de chercher un livreur', async () => {
      const res = await createOrder({ paymentMethod: 'MANUAL_MOBILE_MONEY' });
      expect(res.body.status).toBe('PENDING_PAYMENT');
      expect(await driverOffer()).toHaveLength(0);
      const declared = await http.post(`/api/v1/orders/${res.body.id}/payment`).set(auth(client)).send({ operator: 'MOOV', reference: 'MOOV-REF-777', payerPhone: '76000001' });
      expect(declared.body.payments[0].status).toBe('PENDING');
      const pending = await http.get('/api/v1/admin/payments?status=PENDING').set(auth(admin));
      const payment = pending.body.items.find((p: { orderId: string }) => p.orderId === res.body.id);
      await http.post(`/api/v1/admin/payments/${payment.id}/validate`).set(auth(admin)).expect(200);
      const order = await http.get(`/api/v1/orders/${res.body.id}`).set(auth(client));
      expect(order.body.status).toBe('SEARCHING_DRIVER');
      expect(order.body.paymentStatus).toBe('SUCCEEDED');
      expect(await driverOffer()).toHaveLength(1);
      await http.post(`/api/v1/orders/${res.body.id}/cancel`).set(auth(client)).send({ reason: 'Test terminé' }).expect(200);
      expect((await http.get('/api/v1/wallet').set(auth(client))).body.balance).toBe(5000 + res.body.totalAmount);
    });
  });

  describe('courses avec achats avancés par le livreur', () => {
    it('impose le ticket, recalcule les frais et encaisse achats + livraison', async () => {
      const res = await createOrder({
        serviceType: 'ERRAND',
        purchaseBudget: 10000,
        items: [{ label: '2 kg de riz' }, { label: 'Huile 1 L', quantity: 2 }],
      });
      expect(res.status).toBe(201);
      const orderId = res.body.id;
      const [offer] = await driverOffer();
      await http.post(`/api/v1/driver/offers/${offer.offerId}/accept`).set(auth(driver)).expect(200);
      await act(orderId, 'ARRIVED_PICKUP').expect(200);
      expect((await act(orderId, 'PICKED_UP')).status).toBe(400);
      await act(orderId, 'START_PURCHASE').expect(200);
      expect((await act(orderId, 'PICKED_UP')).status).toBe(400); // montant et ticket d'abord

      const receipt = await upload('RECEIPT');
      const bought = await http.post(`/api/v1/driver/missions/${orderId}/purchase`).set(auth(driver)).send({ actualAmount: 8750, receiptFileKey: receipt.key });
      expect(bought.status).toBe(200);
      expect(bought.body.purchaseActualAmount).toBe(8750);
      await act(orderId, 'PICKED_UP').expect(200);
      const arrived = await act(orderId, 'ARRIVED_DROPOFF');
      const dropoff = arrived.body.stops.find((s: { kind: string }) => s.kind === 'DROPOFF');
      expect(dropoff.amountToCollect).toBe(arrived.body.deliveryFee + 8750);

      const code = (await http.get(`/api/v1/orders/${orderId}`).set(auth(client))).body.deliveryCode;
      const photo = await upload('DELIVERY_PROOF');
      const done = await http.post(`/api/v1/driver/missions/${orderId}/deliver`).set(auth(driver)).send({ code, photoFileKey: photo.key });
      expect(done.body.status).toBe('DELIVERED');
      expect(done.body.totalAmount).toBe(done.body.deliveryFee + 8750);

      // Le client voit le ticket et la photo par des liens signés.
      const seen = await http.get(`/api/v1/orders/${orderId}`).set(auth(client));
      const proofUrl = seen.body.proofs.find((p: { type: string }) => p.type === 'RECEIPT').url as string;
      expect((await http.get(proofUrl)).status).toBe(200);
      expect((await http.get(proofUrl.replace(/sig=[^&]+/, 'sig=faux'))).status).toBe(403);
    });

    it('refuse un fichier qui n’est pas une image', async () => {
      const res = await http.post('/api/v1/uploads/RECEIPT').set(auth(driver)).attach('file', Buffer.from('ceci est un texte, pas une photo'), 'photo.jpg');
      expect(res.status).toBe(400);
    });
  });

  describe('promotions, réclamations, statistiques', () => {
    it('applique un code promo une seule fois par client', async () => {
      await http.post('/api/v1/admin/promotions').set(auth(admin)).send({ code: 'moitie', name: '-50 %', type: 'PERCENT', value: 50, startsAt: new Date(Date.now() - 1000).toISOString() }).expect(201);
      const res = await createOrder({ promoCode: 'MOITIE' });
      expect(res.status).toBe(201);
      expect(res.body.discountAmount).toBe(Math.round(res.body.deliveryFee / 2));
      expect(res.body.totalAmount).toBe(res.body.deliveryFee - res.body.discountAmount);
      const again = await createOrder({ promoCode: 'MOITIE' });
      expect(again.status).toBe(400);
      await http.post(`/api/v1/orders/${res.body.id}/cancel`).set(auth(client)).send({ reason: 'Test terminé' }).expect(200);
    });

    it('traite une réclamation avec geste commercial', async () => {
      const before = (await http.get('/api/v1/wallet').set(auth(client))).body.balance;
      const created = await http.post('/api/v1/complaints').set(auth(client)).send({ category: 'RETARD', description: 'Le livreur est arrivé avec 40 minutes de retard.' });
      expect(created.status).toBe(201);
      await http.post(`/api/v1/complaints/${created.body.id}/messages`).set(auth(admin)).send({ body: 'Note interne', isInternal: true }).expect(201);
      await http.post(`/api/v1/complaints/${created.body.id}/messages`).set(auth(admin)).send({ body: 'Nous sommes désolés.' }).expect(201);
      const resolved = await http.patch(`/api/v1/admin/complaints/${created.body.id}`).set(auth(admin)).send({ status: 'RESOLVED', resolution: 'Geste commercial', refundAmount: 500 });
      expect(resolved.body.status).toBe('RESOLVED');
      expect((await http.get('/api/v1/wallet').set(auth(client))).body.balance).toBe(before + 500);
      const seen = await http.get(`/api/v1/complaints/${created.body.id}`).set(auth(client));
      expect(seen.body.messages.map((m: { body: string }) => m.body)).toEqual(['Nous sommes désolés.']);
    });

    it('produit les statistiques du tableau de bord', async () => {
      const res = await http.get('/api/v1/admin/stats/overview').set(auth(admin));
      expect(res.status).toBe(200);
      expect(res.body.orders.delivered).toBe(2);
      expect(res.body.money.deliveryRevenue).toBeGreaterThan(0);
      expect(res.body.daily.length).toBeGreaterThanOrEqual(30);
      const drivers = await http.get('/api/v1/admin/stats/drivers').set(auth(admin));
      expect(drivers.body[0].deliveries).toBe(2);
    });
  });

  describe('périmètre par ville', () => {
    it('limite un responsable de Tenkodogo à sa ville', async () => {
      const cities = (await http.get('/api/v1/cities')).body as { id: string; slug: string }[];
      const tenko = cities.find((c) => c.slug === 'tenkodogo')!;
      const ouaga = cities.find((c) => c.slug === 'ouagadougou')!;
      const created = await http.post('/api/v1/admin/staff').set(auth(admin)).send({
        phone: '70 60 60 60', firstName: 'Rasmané', lastName: 'Kiemdé', roles: [{ roleCode: 'CITY_MANAGER', cityId: tenko.id }],
      });
      expect(created.status).toBe(201);
      const manager = (await login('70606060', created.body.temporaryPassword)).accessToken;

      const ouagaOrder = (await http.get('/api/v1/admin/orders?pageSize=1').set(auth(admin))).body.items[0];
      expect((await http.get(`/api/v1/admin/orders/${ouagaOrder.id}`).set(auth(manager))).status).toBe(403);
      const list = await http.get('/api/v1/admin/orders').set(auth(manager));
      expect(list.body.items.every((o: { city: { name: string } }) => o.city.name === 'Tenkodogo')).toBe(true);
      expect((await http.get(`/api/v1/admin/orders?cityId=${ouaga.id}`).set(auth(manager))).status).toBe(403);
      expect((await http.get(`/api/v1/admin/drivers/${driverId}`).set(auth(manager))).status).toBe(403);

      const rule = { name: 'Test', baseFare: 100, minFare: 100, pricePerKm: 10, commissionPercent: 10, isActive: false };
      expect((await http.post('/api/v1/admin/pricing-rules').set(auth(manager)).send({ ...rule, cityId: ouaga.id })).status).toBe(403);
      expect((await http.post('/api/v1/admin/pricing-rules').set(auth(manager)).send({ ...rule, cityId: tenko.id })).status).toBe(201);
      expect((await http.post('/api/v1/admin/cities').set(auth(manager)).send({ name: 'Koudougou', slug: 'koudougou', centerLat: 12.25, centerLng: -2.36 })).status).toBe(403);

      const stats = await http.get('/api/v1/admin/stats/overview').set(auth(manager));
      expect(stats.status).toBe(200);
      expect(stats.body.orders.delivered).toBe(0);
    });
  });

  describe('temps réel', () => {
    it('prévient le livreur d’une offre et le client de l’acceptation', async () => {
      await app.listen(0);
      const port = (app.getHttpServer().address() as AddressInfo).port;
      const connect = (token: string) =>
        new Promise<Socket>((resolve, reject) => {
          const socket = io(`http://127.0.0.1:${port}`, { path: '/api/v1/socket.io', addTrailingSlash: false, auth: { token }, transports: ['websocket'] });
          socket.on('connect', () => resolve(socket));
          socket.on('connect_error', reject);
        });
      const driverSocket = await connect(driver);
      const clientSocket = await connect(client);
      try {
        const offerReceived = new Promise<{ orderId: string; offerId: string }>((resolve) => driverSocket.on('offer.new', resolve));
        const res = await createOrder({});
        const offer = await offerReceived;
        expect(offer.orderId).toBe(res.body.id);

        const ack = await clientSocket.emitWithAck('order:subscribe', { orderId: res.body.id });
        expect(ack.ok).toBe(true);
        const intruder = await driverSocket.emitWithAck('order:subscribe', { orderId: '00000000-0000-4000-8000-000000000000' });
        expect(intruder.ok).toBe(false);

        const updated = new Promise<{ status: string }>((resolve) =>
          clientSocket.on('order.updated', (e: { status: string }) => e.status === 'DRIVER_ASSIGNED' && resolve(e)),
        );
        await http.post(`/api/v1/driver/offers/${offer.offerId}/accept`).set(auth(driver)).expect(200);
        expect((await updated).status).toBe('DRIVER_ASSIGNED');

        const located = new Promise<{ lat: number }>((resolve) => clientSocket.on('driver.location', resolve));
        await http.post('/api/v1/driver/location').set(auth(driver)).send({ points: [{ lat: 12.361, lng: -1.531 }] }).expect(200);
        expect((await located).lat).toBe(12.361);
        await http.post(`/api/v1/admin/orders/${res.body.id}/cancel`).set(auth(admin)).send({ reason: 'Fin du test' }).expect(200);
      } finally {
        driverSocket.close();
        clientSocket.close();
      }
    });
  });
});
