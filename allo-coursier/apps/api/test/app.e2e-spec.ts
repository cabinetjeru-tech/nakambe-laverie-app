/**
 * Tests de bout en bout du lot 1 (comptes, rôles, villes/zones, tarifs).
 * Utilise une base dédiée, remise à zéro puis ré-alimentée par le seed avant les tests :
 *   TEST_DATABASE_URL (par défaut : base allo_coursier_test locale).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { configureTestEnv, createTestApp, resetTestDatabase } from './helpers';

configureTestEnv();

// Points de test
const OUAGA_A = { lat: 12.3569, lng: -1.5352 }; // Gounghin
const OUAGA_B = { lat: 12.3905, lng: -1.4952 }; // ~6 km
const TENKODOGO = { lat: 11.785, lng: -0.365 };
const BOBO = { lat: 11.1771, lng: -4.2979 };

describe('API ALLÔ-COURSIER — lot 1 (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let adminToken: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    await resetTestDatabase();
    ({ app, http } = await createTestApp());

    const res = await http.post('/api/v1/auth/login').send({ phone: '70 00 00 00', secret: 'AlloAdmin@2026' });
    expect(res.status).toBe(200);
    adminToken = res.body.accessToken;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('répond au contrôle de santé', async () => {
    const res = await http.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  describe('inscription et connexion', () => {
    it('refuse un numéro invalide et un code trop simple', async () => {
      const base = { firstName: 'Test', lastName: 'Client', accountType: 'CLIENT' };
      expect((await http.post('/api/v1/auth/register').send({ ...base, phone: '123', pin: '482913' })).status).toBe(400);
      const weak = await http.post('/api/v1/auth/register').send({ ...base, phone: '70 11 11 11', pin: '1234' });
      expect(weak.status).toBe(400);
      expect(weak.body.message).toMatch(/suite/);
    });

    it('crée un compte client, refuse le doublon, puis connecte', async () => {
      const body = { phone: '70 11 22 33', firstName: 'Mariam', lastName: 'Kaboré', pin: '739251', accountType: 'CLIENT' };
      const res = await http.post('/api/v1/auth/register').send(body);
      expect(res.status).toBe(201);
      expect(res.body.user.phone).toBe('+22670112233');
      expect(res.body.user.roles).toEqual(['CLIENT']);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();

      expect((await http.post('/api/v1/auth/register').send(body)).status).toBe(409);

      const login = await http.post('/api/v1/auth/login').send({ phone: '+226 70 11 22 33', secret: '739251' });
      expect(login.status).toBe(200);
      const me = await http.get('/api/v1/auth/me').set(auth(login.body.accessToken));
      expect(me.status).toBe(200);
      expect(me.body.firstName).toBe('Mariam');
    });

    it('bloque temporairement le compte après 5 codes erronés', async () => {
      await http.post('/api/v1/auth/register').send({
        phone: '70 44 55 66', firstName: 'Paul', lastName: 'Zongo', pin: '592817', accountType: 'CLIENT',
      });
      for (let i = 0; i < 5; i++) {
        const res = await http.post('/api/v1/auth/login').send({ phone: '70445566', secret: '000001' });
        expect(res.status).toBe(401);
      }
      const locked = await http.post('/api/v1/auth/login').send({ phone: '70445566', secret: '592817' });
      expect(locked.status).toBe(403);
      expect(locked.body.message).toMatch(/Réessayez/);
    });

    it('renouvelle la session et détecte la réutilisation d’un ancien jeton', async () => {
      const reg = await http.post('/api/v1/auth/register').send({
        phone: '70 77 88 99', firstName: 'Rasmata', lastName: 'Compaoré', pin: '815263', accountType: 'CLIENT',
      });
      const first = reg.body.refreshToken;
      const refreshed = await http.post('/api/v1/auth/refresh').send({ refreshToken: first });
      expect(refreshed.status).toBe(200);
      const second = refreshed.body.refreshToken;
      expect(second).not.toBe(first);

      // Réutilisation de l'ancien jeton : refus et fermeture de toutes les sessions.
      expect((await http.post('/api/v1/auth/refresh').send({ refreshToken: first })).status).toBe(401);
      expect((await http.post('/api/v1/auth/refresh').send({ refreshToken: second })).status).toBe(401);
    });

    it('déconnecte une session', async () => {
      const login = await http.post('/api/v1/auth/login').send({ phone: '70112233', secret: '739251' });
      expect((await http.post('/api/v1/auth/logout').send({ refreshToken: login.body.refreshToken })).status).toBe(200);
      expect((await http.post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken })).status).toBe(401);
    });
  });

  describe('droits d’accès', () => {
    it('refuse l’administration sans connexion ou à un client', async () => {
      expect((await http.get('/api/v1/admin/pricing-rules')).status).toBe(401);
      const login = await http.post('/api/v1/auth/login').send({ phone: '76000001', secret: '482913' });
      expect((await http.get('/api/v1/admin/pricing-rules').set(auth(login.body.accessToken))).status).toBe(403);
    });

    it("crée un dispatcheur aux droits limités et empêche l'élévation de droits", async () => {
      const created = await http
        .post('/api/v1/admin/staff')
        .set(auth(adminToken))
        .send({ phone: '70 20 20 20', firstName: 'Salif', lastName: 'Traoré', roles: [{ roleCode: 'DISPATCHER' }] });
      expect(created.status).toBe(201);
      expect(created.body.temporaryPassword).toBeDefined();

      const login = await http.post('/api/v1/auth/login').send({ phone: '70202020', secret: created.body.temporaryPassword });
      expect(login.status).toBe(200);
      const token = login.body.accessToken;
      expect((await http.get('/api/v1/admin/pricing-rules').set(auth(token))).status).toBe(200);
      expect((await http.post('/api/v1/admin/pricing-rules').set(auth(token)).send({})).status).toBe(403);
      expect(
        (await http.post('/api/v1/admin/staff').set(auth(token)).send({ phone: '70212121', firstName: 'X', lastName: 'Y', roles: [{ roleCode: 'SUPER_ADMIN' }] })).status,
      ).toBe(403);
    });

    it('empêche de donner des droits d’administration aux rôles publics', async () => {
      const roles = await http.get('/api/v1/admin/roles').set(auth(adminToken));
      const client = roles.body.find((r: { code: string }) => r.code === 'CLIENT');
      const res = await http
        .put(`/api/v1/admin/roles/${client.id}/permissions`)
        .set(auth(adminToken))
        .send({ permissionCodes: ['pricing.manage'] });
      expect(res.status).toBe(400);
    });

    it('empêche de retirer le dernier super-administrateur', async () => {
      const me = await http.get('/api/v1/auth/me').set(auth(adminToken));
      const res = await http.put(`/api/v1/admin/users/${me.body.id}/roles`).set(auth(adminToken)).send({ roles: [] });
      expect(res.status).toBe(400);
    });
  });

  describe('livreurs', () => {
    it("inscrit un livreur en attente puis le valide", async () => {
      const cities = await http.get('/api/v1/cities');
      const tenko = cities.body.find((c: { slug: string }) => c.slug === 'tenkodogo');
      const reg = await http.post('/api/v1/auth/register').send({
        phone: '65 10 20 30', firstName: 'Adama', lastName: 'Ilboudo', pin: '640297',
        accountType: 'DRIVER', driver: { cityId: tenko.id, vehicleType: 'TRICYCLE', plateNumber: '11 ab 1234' },
      });
      expect(reg.status).toBe(201);
      expect(reg.body.user.driver).toMatchObject({ status: 'PENDING', vehicleType: 'TRICYCLE', employmentType: 'INDEPENDANT' });

      const id = reg.body.user.id;
      const pending = await http.get('/api/v1/admin/drivers?status=PENDING').set(auth(adminToken));
      expect(pending.body.items.some((d: { userId: string }) => d.userId === id)).toBe(true);

      const approved = await http.post(`/api/v1/admin/drivers/${id}/approve`).set(auth(adminToken));
      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe('APPROVED');

      const updated = await http.patch(`/api/v1/admin/drivers/${id}`).set(auth(adminToken)).send({ employmentType: 'SALARIE' });
      expect(updated.body.employmentType).toBe('SALARIE');
    });

    it('crée directement un livreur salarié avec un code temporaire', async () => {
      const cities = await http.get('/api/v1/cities');
      const res = await http.post('/api/v1/admin/drivers').set(auth(adminToken)).send({
        phone: '66 00 00 01', firstName: 'Moussa', lastName: 'Kinda', cityId: cities.body[0].id,
        vehicleType: 'MOTO', employmentType: 'SALARIE',
      });
      expect(res.status).toBe(201);
      expect(res.body.driver.status).toBe('APPROVED');
      const login = await http.post('/api/v1/auth/login').send({ phone: '66000001', secret: res.body.temporaryPin });
      expect(login.status).toBe(200);
    });
  });

  describe('villes, zones et devis', () => {
    it('localise les points desservis', async () => {
      const ouaga = await http.get('/api/v1/geo/locate').query(OUAGA_A);
      expect(ouaga.body).toMatchObject({ served: true, city: { name: 'Ouagadougou' } });
      const bobo = await http.get('/api/v1/geo/locate').query(BOBO);
      expect(bobo.body.served).toBe(false);
    });

    it('calcule un devis standard et express à Ouagadougou', async () => {
      const res = await http.post('/api/v1/pricing/quote').send({ pickup: OUAGA_A, dropoff: OUAGA_B, serviceType: 'PARCEL' });
      expect(res.status).toBe(200);
      expect(res.body.city.name).toBe('Ouagadougou');
      expect(res.body.distanceKm).toBeGreaterThan(5);
      expect(res.body.express.deliveryFee).toBeGreaterThan(res.body.standard.deliveryFee);
      expect(res.body.standard.deliveryFee % 50).toBe(0);
      expect(res.body.standard.commissionAmount + res.body.standard.driverEarning).toBe(res.body.standard.deliveryFee);
    });

    it('applique le tarif tricycle et les frais d’achat', async () => {
      const moto = await http.post('/api/v1/pricing/quote').send({ pickup: OUAGA_A, dropoff: OUAGA_B, serviceType: 'PURCHASE', purchaseAmount: 5000 });
      const tri = await http.post('/api/v1/pricing/quote').send({ pickup: OUAGA_A, dropoff: OUAGA_B, serviceType: 'PURCHASE', vehicleType: 'TRICYCLE', purchaseAmount: 5000 });
      expect(tri.body.standard.deliveryFee).toBeGreaterThan(moto.body.standard.deliveryFee);
      expect(moto.body.standard.purchaseAmount).toBe(5000);
      expect(moto.body.standard.totalToPay).toBe(moto.body.standard.deliveryFee + 5000);
      expect(moto.body.standard.lines.some((l: { code: string }) => l.code === 'PURCHASE_FEE')).toBe(true);
    });

    it('refuse les adresses non desservies et les trajets entre villes', async () => {
      const out = await http.post('/api/v1/pricing/quote').send({ pickup: OUAGA_A, dropoff: BOBO, serviceType: 'PARCEL' });
      expect(out.status).toBe(400);
      const inter = await http.post('/api/v1/pricing/quote').send({ pickup: OUAGA_A, dropoff: TENKODOGO, serviceType: 'PARCEL' });
      expect(inter.status).toBe(400);
      expect(inter.body.message).toMatch(/entre deux villes/);
    });

    it('applique une règle propre à une zone dessinée par l’administration', async () => {
      const cities = await http.get('/api/v1/cities');
      const ouaga = cities.body.find((c: { slug: string }) => c.slug === 'ouagadougou');
      const zone = await http.post(`/api/v1/admin/cities/${ouaga.id}/zones`).set(auth(adminToken)).send({
        name: 'Gounghin',
        polygon: { type: 'Polygon', coordinates: [[[-1.55, 12.34], [-1.52, 12.34], [-1.52, 12.37], [-1.55, 12.37], [-1.55, 12.34]]] },
      });
      expect(zone.status).toBe(201);

      const rule = await http.post('/api/v1/admin/pricing-rules').set(auth(adminToken)).send({
        name: 'Gounghin — tarif spécial', cityId: ouaga.id, zoneId: zone.body.id,
        baseFare: 2000, minFare: 2000, pricePerKm: 0, commissionPercent: 10,
      });
      expect(rule.status).toBe(201);

      const quote = await http.post('/api/v1/pricing/quote').send({ pickup: OUAGA_A, dropoff: OUAGA_B, serviceType: 'PARCEL' });
      expect(quote.body.zone.name).toBe('Gounghin');
      expect(quote.body.rule.id).toBe(rule.body.id);
      expect(quote.body.standard.deliveryFee).toBe(2000);

      await http.delete(`/api/v1/admin/pricing-rules/${rule.body.id}`).set(auth(adminToken)).expect(200);
      const after = await http.post('/api/v1/pricing/quote').send({ pickup: OUAGA_A, dropoff: OUAGA_B, serviceType: 'PARCEL' });
      expect(after.body.rule.id).not.toBe(rule.body.id);

      const logs = await http.get('/api/v1/admin/audit-logs').query({ entityType: 'PricingRule', entityId: rule.body.id }).set(auth(adminToken));
      expect(logs.body.items.map((l: { action: string }) => l.action).sort()).toEqual(['pricing_rule.create', 'pricing_rule.deactivate']);
    });

    it('refuse une zone mal formée et une plage de nuit incomplète', async () => {
      const cities = await http.get('/api/v1/cities');
      const zone = await http.post(`/api/v1/admin/cities/${cities.body[0].id}/zones`).set(auth(adminToken)).send({
        name: 'Ouverte', polygon: { type: 'Polygon', coordinates: [[[-1.5, 12.3], [-1.4, 12.3], [-1.4, 12.4], [-1.5, 12.4]]] },
      });
      expect(zone.status).toBe(400);
      const rule = await http.post('/api/v1/admin/pricing-rules').set(auth(adminToken)).send({
        name: 'Incomplète', cityId: cities.body[0].id, baseFare: 1, minFare: 1, pricePerKm: 1, commissionPercent: 1, nightStart: '21:00',
      });
      expect(rule.status).toBe(400);
    });

    it('simule une règle en projet', async () => {
      const res = await http.post('/api/v1/admin/pricing/simulate').set(auth(adminToken)).send({
        params: { baseFare: 500, minFare: 1000, pricePerKm: 150, includedKm: 2, commissionPercent: 20 },
        distanceKm: 6.3,
        speed: 'STANDARD',
      });
      expect(res.status).toBe(200);
      expect(res.body.deliveryFee).toBe(1150);
    });
  });

  describe('compte client', () => {
    it('enregistre une adresse avec son repère et sa ville', async () => {
      const login = await http.post('/api/v1/auth/login').send({ phone: '70112233', secret: '739251' });
      const token = login.body.accessToken;
      const res = await http.post('/api/v1/me/addresses').set(auth(token)).send({
        label: 'Bureau', ...OUAGA_B, landmark: 'Face à la station Total, 2e étage', contactPhone: '70 11 22 33',
      });
      expect(res.status).toBe(201);
      expect(res.body.isDefault).toBe(true);
      expect(res.body.cityId).toBeDefined();
      expect(res.body.contactPhone).toBe('+22670112233');
    });
  });

  describe('paramètres', () => {
    it('valide les valeurs des paramètres', async () => {
      const bad = await http.put('/api/v1/admin/settings/routing.roadCoefficient').set(auth(adminToken)).send({ value: 12 });
      expect(bad.status).toBe(400);
      const ok = await http.put('/api/v1/admin/settings/payments.mobileMoney.orangeNumber').set(auth(adminToken)).send({ value: '+22670000000' });
      expect(ok.status).toBe(200);
      const pub = await http.get('/api/v1/settings/public');
      expect(pub.body.mobileMoney.orangeNumber).toBe('+22670000000');
    });
  });
});
