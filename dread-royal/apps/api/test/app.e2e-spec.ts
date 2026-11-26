import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Tests de bout en bout sur une vraie base PostgreSQL (dread_royal_test).
 * Les tests sont séquentiels : chaque bloc s'appuie sur les données créées avant.
 */
describe('DREAD ROYAL — API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let http: ReturnType<typeof request>;
  const T: Record<string, string> = {}; // jetons par rôle
  const ids: Record<string, string> = {};
  const today = new Date().toISOString().slice(0, 10);

  const as = (role: string) => ({
    get: (u: string) => http.get(`/api${u}`).set('Authorization', `Bearer ${T[role]}`),
    post: (u: string, b?: object) => http.post(`/api${u}`).set('Authorization', `Bearer ${T[role]}`).send(b ?? {}),
    patch: (u: string, b?: object) => http.patch(`/api${u}`).set('Authorization', `Bearer ${T[role]}`).send(b ?? {}),
    put: (u: string, b?: object) => http.put(`/api${u}`).set('Authorization', `Bearer ${T[role]}`).send(b ?? {}),
  });
  const login = async (username: string, password: string) => {
    const r = await http.post('/api/auth/login').send({ username, password });
    expect(r.status).toBe(200);
    return r.body;
  };
  const svc = async (code: string) => (await prisma.service.findUniqueOrThrow({ where: { code } }));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    http = request(app.getHttpServer()) as any;
  });
  afterAll(async () => { await app?.close(); });

  // ───────────────────────── Authentification ─────────────────────────
  describe('Authentification et sessions', () => {
    it('santé publique', async () => {
      const r = await http.get('/api/health');
      expect(r.status).toBe(200);
      expect(r.body.status).toBe('ok');
    });

    it('refuse un mauvais mot de passe et les routes sans jeton', async () => {
      expect((await http.post('/api/auth/login').send({ username: 'proprietaire', password: 'faux' })).status).toBe(401);
      expect((await http.get('/api/clients')).status).toBe(401);
      expect((await http.get('/api/clients').set('Authorization', 'Bearer abc')).status).toBe(401);
    });

    it('connecte le propriétaire et impose le changement de mot de passe', async () => {
      const b = await login('proprietaire', 'Owner2026!');
      expect(b.user.mustChangePassword).toBe(true);
      expect(b.user.permissions).toContain('*');
      T.owner = b.accessToken;
      ids.ownerRefresh = b.refreshToken;
      expect((await as('owner').post('/auth/change-password', { currentPassword: 'Owner2026!', newPassword: 'court' })).status).toBe(400);
      const r = await as('owner').post('/auth/change-password', { currentPassword: 'Owner2026!', newPassword: 'Couronne2026' });
      expect(r.status).toBe(200);
      const b2 = await login('proprietaire', 'Couronne2026');
      expect(b2.user.mustChangePassword).toBe(false);
      T.owner = b2.accessToken;
      ids.ownerRefresh = b2.refreshToken;
    });

    it('rotation du jeton de rafraîchissement et détection de réutilisation', async () => {
      const r1 = await http.post('/api/auth/refresh').send({ refreshToken: ids.ownerRefresh });
      expect(r1.status).toBe(200);
      // L'ancien jeton réutilisé → refus + révocation de toutes les sessions
      expect((await http.post('/api/auth/refresh').send({ refreshToken: ids.ownerRefresh })).status).toBe(401);
      expect((await http.post('/api/auth/refresh').send({ refreshToken: r1.body.refreshToken })).status).toBe(401);
      const b = await login('proprietaire', 'Couronne2026');
      T.owner = b.accessToken;
    });

    it('le mot de passe est haché (bcrypt) en base', async () => {
      const u = await prisma.user.findUniqueOrThrow({ where: { username: 'proprietaire' } });
      expect(u.passwordHash).toMatch(/^\$2[aby]\$12\$/);
      expect(u.passwordHash).not.toContain('Couronne2026');
    });
  });

  // ───────────────────────── Personnel & utilisateurs ─────────────────────────
  describe('Personnel, utilisateurs et rôles', () => {
    it('crée le personnel', async () => {
      const mk = async (key: string, body: object) => {
        const r = await as('owner').post('/staff', body);
        expect(r.status).toBe(201);
        ids[key] = r.body.id;
        return r.body;
      };
      const a = await mk('staffAli', { firstName: 'Ali', lastName: 'OUÉDRAOGO', position: 'Locticien', hireDate: '2025-01-15', contractType: 'CDI', baseSalary: 60000, commissionMode: 'SERVICE_DEFAULT' });
      expect(a.code).toBe('EMP-001');
      await mk('staffAwa', { firstName: 'Awa', lastName: 'SAWADOGO', position: 'Tresseuse', hireDate: '2025-03-01', contractType: 'PRESTATAIRE', commissionMode: 'PERCENT', commissionRate: 40 });
      await mk('staffIbra', { firstName: 'Ibrahim', lastName: 'KABORÉ', position: 'Barbier', hireDate: '2025-06-01', contractType: 'CDD', commissionMode: 'FIXED', commissionFixed: 500 });
    });

    it('crée un compte par rôle', async () => {
      const roles = (await as('owner').get('/roles')).body as { id: string; code: string }[];
      expect(roles.map((r) => r.code).sort()).toEqual(['CASHIER', 'MANAGER', 'OWNER', 'STOCK_MANAGER', 'STYLIST']);
      const role = (c: string) => roles.find((r) => r.code === c)!.id;
      const mk = async (username: string, roleCode: string, staffId?: string) => {
        const r = await as('owner').post('/users', { username, fullName: username, roleId: role(roleCode), staffId, password: 'Temp2026x' });
        expect(r.status).toBe(201);
        expect(r.body.passwordHash).toBeUndefined();
        const b = await login(username, 'Temp2026x');
        expect(b.user.mustChangePassword).toBe(true);
        return b;
      };
      T.manager = (await mk('responsable', 'MANAGER')).accessToken;
      T.cashier = (await mk('caissiere', 'CASHIER')).accessToken;
      const sty = await mk('ali', 'STYLIST', ids.staffAli);
      T.stylist = sty.accessToken;
      ids.stylistUser = sty.user.id;
      T.stock = (await mk('magasin', 'STOCK_MANAGER')).accessToken;
      expect((await as('owner').post('/users', { username: 'responsable', fullName: 'Doublon', roleId: role('CASHIER'), password: 'Temp2026x' })).status).toBe(409);
    });

    it('vérifie les permissions côté serveur', async () => {
      expect((await as('stylist').get('/users')).status).toBe(403);
      expect((await as('cashier').get('/users')).status).toBe(403);
      expect((await as('manager').get('/users')).status).toBe(403);
      expect((await as('cashier').post('/services', { code: 'X01', name: 'x', categoryId: randomUUID(), price: 1, durationMin: 10 })).status).toBe(403);
      expect((await as('stock').post('/sales', { items: [] })).status).toBe(403);
      expect((await as('stylist').get('/finance/summary')).status).toBe(403);
      expect((await as('stock').get('/dashboard')).status).toBe(403);
      expect((await as('cashier').get('/audit')).status).toBe(403);
      expect((await as('owner').get('/audit')).status).toBe(200);
    });

    it('le propriétaire peut modifier les permissions d’un rôle (pas celles du propriétaire)', async () => {
      const roles = (await as('owner').get('/roles')).body as any[];
      const owner = roles.find((r) => r.code === 'OWNER');
      expect((await as('owner').patch(`/roles/${owner.id}`, { name: 'x', permissions: [] })).status).toBe(400);
      const stock = roles.find((r) => r.code === 'STOCK_MANAGER');
      const r = await as('owner').patch(`/roles/${stock.id}`, { name: stock.name, permissions: [...stock.permissions, 'reports.view'] });
      expect(r.status).toBe(200);
      expect((await as('owner').patch(`/roles/${stock.id}`, { name: stock.name, permissions: ['inexistante'] })).status).toBe(400);
    });
  });

  // ───────────────────────── Clients ─────────────────────────
  describe('Clients', () => {
    it('crée, normalise le téléphone et refuse les doublons', async () => {
      const r = await as('cashier').post('/clients', { firstName: 'Mariam', lastName: 'Traoré', phone: '+226 70 11 22 33', gender: 'FEMALE', preferences: 'Knotless moyennes' });
      expect(r.status).toBe(201);
      expect(r.body.code).toBe('CL-000001');
      expect(r.body.phone).toBe('70112233');
      expect(r.body.lastName).toBe('TRAORÉ');
      ids.clientMariam = r.body.id;
      expect((await as('cashier').post('/clients', { firstName: 'X', lastName: 'Y', phone: '70 11 22 33', gender: 'MALE' })).status).toBe(409);
      expect((await as('cashier').post('/clients', { firstName: 'X', lastName: 'Y', phone: 'abc', gender: 'MALE' })).status).toBe(400);
      const r2 = await as('cashier').post('/clients', { firstName: 'Boukary', lastName: 'Zongo', phone: '76 44 55 66', gender: 'MALE' });
      ids.clientBoukary = r2.body.id;
      const r3 = await as('cashier').post('/clients', { firstName: 'Fatim', lastName: 'Compaoré', gender: 'CHILD_FEMALE', birthDate: '2018-05-02' });
      ids.clientFatim = r3.body.id;
    });

    it('recherche par nom et par téléphone', async () => {
      expect((await as('cashier').get('/clients?search=traor')).body.total).toBe(1);
      expect((await as('cashier').get('/clients?search=7644')).body.items[0].firstName).toBe('Boukary');
      expect((await as('cashier').get('/clients?search=mariam traoré')).body.total).toBe(1);
    });

    it('le coiffeur ne voit aucun client tant qu’il ne les a pas servis', async () => {
      expect((await as('stylist').get('/clients')).body.total).toBe(0);
      expect((await as('stylist').get(`/clients/${ids.clientMariam}`)).status).toBe(404);
      expect((await as('stylist').post('/clients', { firstName: 'a', lastName: 'b', gender: 'MALE' })).status).toBe(403);
    });
  });

  // ───────────────────────── Prestations ─────────────────────────
  describe('Prestations', () => {
    it('catalogue réaliste chargé et modification tracée', async () => {
      const cats = (await as('owner').get('/services/categories')).body;
      expect(cats).toHaveLength(7);
      const list = (await as('cashier').get('/services')).body;
      expect(list.length).toBeGreaterThan(40);
      const coupe = list.find((s: any) => s.code === 'COH02');
      expect(coupe.price).toBe(1500);
      const r = await as('owner').patch(`/services/${coupe.id}`, { price: 2000, priceMax: 2500 });
      expect(r.status).toBe(200);
      const log = await prisma.auditLog.findFirst({ where: { entity: 'Service', entityId: coupe.id } });
      expect(log?.summary).toContain('1500 → 2000');
      expect((await as('owner').patch(`/services/${coupe.id}`, { commissionType: 'PERCENT', commissionValue: 150 })).status).toBe(400);
    });
  });

  // ───────────────────────── Rendez-vous ─────────────────────────
  describe('Rendez-vous', () => {
    const at = (h: string) => `${today}T${h}:00.000Z`;
    it('crée un rendez-vous et calcule la fin selon la durée', async () => {
      const s = await svc('ENT02'); // 150 min
      const r = await as('cashier').post('/appointments', { clientId: ids.clientBoukary, staffId: ids.staffAli, startAt: at('09:00'), serviceIds: [s.id] });
      expect(r.status).toBe(201);
      expect(new Date(r.body.endAt).toISOString()).toBe(at('11:30'));
      ids.appt1 = r.body.id;
    });

    it('empêche la double réservation du même coiffeur', async () => {
      const s = await svc('COH01');
      const r = await as('cashier').post('/appointments', { clientId: ids.clientMariam, staffId: ids.staffAli, startAt: at('11:00'), serviceIds: [s.id] });
      expect(r.status).toBe(409);
      expect(r.body.message).toContain('Créneau indisponible');
      // Juste après : autorisé
      expect((await as('cashier').post('/appointments', { clientId: ids.clientMariam, staffId: ids.staffAli, startAt: at('11:30'), serviceIds: [s.id] })).status).toBe(201);
      // Autre coiffeur au même moment : autorisé
      const r3 = await as('cashier').post('/appointments', { clientId: ids.clientMariam, staffId: ids.staffAwa, startAt: at('10:00'), serviceIds: [(await svc('CAF04')).id] });
      expect(r3.status).toBe(201);
      ids.appt3 = r3.body.id;
    });

    it('réservations concurrentes : une seule réussit', async () => {
      const s = await svc('COH01');
      const body = { clientId: ids.clientBoukary, staffId: ids.staffIbra, startAt: at('15:00'), serviceIds: [s.id] };
      const res = await Promise.all([as('cashier').post('/appointments', body), as('manager').post('/appointments', body), as('owner').post('/appointments', body)]);
      expect(res.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });

    it('annulation avec motif obligatoire ; le créneau est libéré', async () => {
      expect((await as('cashier').patch(`/appointments/${ids.appt3}/status`, { status: 'CANCELLED' })).status).toBe(400);
      expect((await as('cashier').patch(`/appointments/${ids.appt3}/status`, { status: 'CANCELLED', reason: 'Cliente indisponible' })).status).toBe(200);
      expect((await as('cashier').post('/appointments', { clientId: ids.clientFatim, staffId: ids.staffAwa, startAt: at('10:00'), serviceIds: [(await svc('ENF02')).id] })).status).toBe(201);
    });

    it('le coiffeur ne voit que son planning et ne peut pas annuler', async () => {
      const mine = (await as('stylist').get(`/appointments?from=${today}`)).body as any[];
      expect(mine.length).toBe(2);
      expect(mine.every((a) => a.staff.id === ids.staffAli)).toBe(true);
      expect((await as('stylist').patch(`/appointments/${ids.appt1}/status`, { status: 'IN_PROGRESS' })).status).toBe(200);
      expect((await as('stylist').patch(`/appointments/${ids.appt1}/status`, { status: 'CANCELLED', reason: 'x' })).status).toBe(403);
      expect((await as('stylist').post('/appointments', {})).status).toBe(403);
      // Il voit maintenant son client
      expect((await as('stylist').get('/clients')).body.items.map((c: any) => c.id)).toContain(ids.clientBoukary);
    });
  });

  // ───────────────────────── Stock ─────────────────────────
  describe('Stock et fournisseurs', () => {
    it('crée fournisseur, produits avec stock initial', async () => {
      const sup = await as('stock').post('/stock/suppliers', { name: 'Ets Beauté Afrique', phone: '25 30 40 50' });
      expect(sup.status).toBe(201);
      ids.supplier = sup.body.id;
      const cats = (await as('stock').get('/stock/categories')).body;
      const cat = (c: string) => cats.find((x: any) => x.code === c).id;
      const p1 = await as('stock').post('/stock/products', { reference: 'GEL-LOCK', name: 'Gel locks Lock & Twist 250 ml', categoryId: cat('GEL'), supplierId: ids.supplier, purchasePrice: 3000, salePrice: 4500, minQuantity: 3, initialQuantity: 5 });
      expect(p1.status).toBe(201);
      expect(p1.body.quantity).toBe(5);
      ids.gel = p1.body.id;
      const p2 = await as('stock').post('/stock/products', { reference: 'KARITE-250', name: 'Beurre de karité pur 250 g', categoryId: cat('HUILE'), purchasePrice: 1000, salePrice: 2000, minQuantity: 5, initialQuantity: 10 });
      ids.karite = p2.body.id;
      expect((await as('cashier').post('/stock/products', { reference: 'X', name: 'x', categoryId: cat('GEL'), purchasePrice: 1, salePrice: 1 })).status).toBe(403);
    });

    it('achat fournisseur : entrée en stock, CMUP, dette fournisseur, pas une charge', async () => {
      const r = await as('stock').post('/stock/purchases', { supplierId: ids.supplier, purchaseDate: today, lines: [{ productId: ids.gel, quantity: 5, unitCost: 3400 }], paidAmount: 0, reference: 'FA-889' });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('UNPAID');
      ids.purchase = r.body.id;
      const gel = await prisma.product.findUniqueOrThrow({ where: { id: ids.gel } });
      expect(gel.quantity).toBe(10);
      expect(gel.purchasePrice).toBe(3200); // (5×3000 + 5×3400) / 10
      const pay = (await as('owner').get('/finance/payables')).body;
      expect(pay.total).toBe(17000);
    });

    it('sortie interdite au-delà du stock ; consommation interne', async () => {
      expect((await as('stock').post('/stock/movements', { productId: ids.karite, type: 'OUT', quantity: 50, reason: 'Casse' })).status).toBe(400);
      const r = await as('stock').post('/stock/movements', { productId: ids.karite, type: 'USAGE', quantity: 2, reason: 'Bains d’huile du jour' });
      expect(r.status).toBe(201);
      expect(r.body.quantityAfter).toBe(8);
      expect((await as('stock').post('/stock/movements', { productId: ids.karite, type: 'USAGE', quantity: 1, reason: 'x' })).status).toBe(400); // motif trop court
    });
  });

  // ───────────────────────── Ventes & caisse ─────────────────────────
  describe('Ventes, paiements, caisse', () => {
    it('refuse un encaissement en espèces caisse fermée', async () => {
      const s = await svc('COH01');
      const r = await as('cashier').post('/sales', { items: [{ type: 'SERVICE', serviceId: s.id, staffId: ids.staffIbra, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] });
      expect(r.status).toBe(400);
      expect(r.body.message).toContain('caisse est fermée');
      expect(await prisma.sale.count()).toBe(0); // transaction annulée
    });

    it('ouvre la caisse', async () => {
      const r = await as('cashier').post('/cash/open', { openingAmount: 20000 });
      expect(r.status).toBe(201);
      expect((await as('cashier').post('/cash/open', { openingAmount: 0 })).status).toBe(400);
    });

    it('vente prestation + produit, acompte, reste à payer, stock et commissions', async () => {
      const s = await svc('ENT02'); // 7 500 – 12 500
      const r = await as('cashier').post('/sales', {
        clientId: ids.clientBoukary, appointmentId: ids.appt1,
        items: [{ type: 'SERVICE', serviceId: s.id, staffId: ids.staffAli, quantity: 1, unitPrice: 10000 }, { type: 'PRODUCT', productId: ids.gel, quantity: 2 }],
        payments: [{ method: 'CASH', amount: 5000 }],
      });
      expect(r.status).toBe(201);
      const sale = r.body;
      ids.sale1 = sale.id;
      expect(sale.number).toMatch(/^FAC-\d{4}-000001$/);
      expect(sale.subtotal).toBe(19000);
      expect(sale.total).toBe(19000);
      expect(sale.paidAmount).toBe(5000);
      expect(sale.balance).toBe(14000);
      expect(sale.paymentStatus).toBe('PARTIAL');
      expect(sale.payments[0].kind).toBe('DEPOSIT');
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.gel } })).quantity).toBe(8);
      const com = await prisma.commission.findMany({ where: { saleItem: { saleId: sale.id } } });
      expect(com).toHaveLength(1);
      expect(com[0].amount).toBe(3000); // 30 % de 10 000
      expect(com[0].status).toBe('PENDING');
      expect((await prisma.appointment.findUniqueOrThrow({ where: { id: ids.appt1 } })).status).toBe('DONE');
    });

    it('refuse un prix hors fourchette, une remise sans droit, un dépassement', async () => {
      const s = await svc('ENT02');
      expect((await as('cashier').post('/sales', { items: [{ type: 'SERVICE', serviceId: s.id, staffId: ids.staffAli, quantity: 1, unitPrice: 1000 }] })).status).toBe(400);
      expect((await as('cashier').post('/sales', { items: [{ type: 'SERVICE', serviceId: s.id, staffId: ids.staffAli, quantity: 1 }], discount: 500, discountReason: 'fidèle' })).status).toBe(403);
      expect((await as('cashier').post('/sales', { items: [{ type: 'SERVICE', serviceId: s.id, quantity: 1 }] })).status).toBe(400); // coiffeur manquant
      expect((await as('cashier').post(`/sales/${ids.sale1}/payments`, { method: 'CASH', amount: 20000 })).status).toBe(400);
      expect((await as('cashier').post(`/sales/${ids.sale1}/payments`, { method: 'ORANGE_MONEY', amount: 1000 })).status).toBe(400); // référence obligatoire
      expect((await as('cashier').post('/sales', { items: [{ type: 'PRODUCT', productId: ids.gel, quantity: 99 }] })).status).toBe(400); // stock insuffisant
    });

    it('solde par Orange Money → commission due + points de fidélité', async () => {
      const r = await as('cashier').post(`/sales/${ids.sale1}/payments`, { method: 'ORANGE_MONEY', amount: 14000, reference: 'OM2611.1234.A' });
      expect(r.status).toBe(201);
      expect(r.body.sale.paymentStatus).toBe('PAID');
      expect(r.body.sale.balance).toBe(0);
      const com = await prisma.commission.findFirstOrThrow({ where: { saleItem: { saleId: ids.sale1 } } });
      expect(com.status).toBe('DUE');
      expect((await prisma.client.findUniqueOrThrow({ where: { id: ids.clientBoukary } })).loyaltyPoints).toBe(19); // 1 pt / 1 000 FCFA
    });

    it('vente avec remise (responsable), commissions individuelles au prorata', async () => {
      const r = await as('manager').post('/sales', {
        clientId: ids.clientMariam,
        items: [{ type: 'SERVICE', serviceId: (await svc('CAF04')).id, staffId: ids.staffAwa, quantity: 1, unitPrice: 15000 }, { type: 'SERVICE', serviceId: (await svc('COH04')).id, staffId: ids.staffIbra, quantity: 1 }],
        discount: 1550, discountReason: 'Promotion Tabaski',
        payments: [{ method: 'MOOV_MONEY', amount: 13950, reference: 'MM-77881' }],
      });
      expect(r.status).toBe(201);
      expect(r.body.total).toBe(13950);
      ids.sale2 = r.body.id;
      const com = await prisma.commission.findMany({ where: { saleItem: { saleId: ids.sale2 } }, orderBy: { amount: 'desc' } });
      expect(com.map((c) => c.amount)).toEqual([5400, 500]); // Awa 40 % de 13 500 ; Ibrahim 500 fixe
      expect(com.every((c) => c.status === 'DUE')).toBe(true);
    });

    it('fidélité : minimum de points requis ; règles réservées au propriétaire', async () => {
      const s = await svc('COH03');
      const r = await as('cashier').post('/sales', { clientId: ids.clientBoukary, items: [{ type: 'SERVICE', serviceId: s.id, staffId: ids.staffIbra, quantity: 1 }], loyaltyPoints: 19 });
      expect(r.status).toBe(400);
      expect(r.body.message).toContain('Minimum 100 points');
      expect((await as('cashier').put('/settings/loyalty', { minRedeemPoints: 10 })).status).toBe(403);
    });

    it('PDF : facture, ticket et reçu', async () => {
      const inv = await as('cashier').get(`/sales/${ids.sale1}/invoice.pdf`);
      expect(inv.status).toBe(200);
      expect(inv.headers['content-type']).toBe('application/pdf');
      expect(inv.body.slice(0, 4).toString()).toBe('%PDF');
      expect((await as('cashier').get(`/sales/${ids.sale1}/ticket.pdf`)).status).toBe(200);
      const sale = (await as('cashier').get(`/sales/${ids.sale1}`)).body;
      expect((await as('cashier').get(`/sales/${ids.sale1}/payments/${sale.payments[1].id}/receipt.pdf`)).status).toBe(200);
      // jeton en paramètre (ouverture dans un nouvel onglet)
      expect((await http.get(`/api/sales/${ids.sale1}/invoice.pdf?access_token=${T.cashier}`)).status).toBe(200);
    });

    it('annulation avec remboursement : stock réintégré, commission annulée, points retirés, trace conservée', async () => {
      const r0 = await as('cashier').post('/sales', { clientId: ids.clientFatim, items: [{ type: 'PRODUCT', productId: ids.karite, quantity: 3 }], payments: [{ method: 'CASH', amount: 6000 }] });
      expect(r0.status).toBe(201);
      const id = r0.body.id;
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.karite } })).quantity).toBe(5);
      expect((await as('cashier').post(`/sales/${id}/cancel`, { reason: 'Erreur' })).status).toBe(403); // caissier sans droit
      expect((await as('owner').post(`/sales/${id}/cancel`, { reason: '' })).status).toBe(400);
      const r = await as('owner').post(`/sales/${id}/cancel`, { reason: 'Produit défectueux', refundMethod: 'CASH' });
      expect(r.status).toBe(201);
      expect(r.body.status).toBe('CANCELLED');
      expect(r.body.refundedAmount).toBe(6000);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.karite } })).quantity).toBe(8);
      expect((await prisma.client.findUniqueOrThrow({ where: { id: ids.clientFatim } })).loyaltyPoints).toBe(0);
      expect(await prisma.sale.findUnique({ where: { id } })).not.toBeNull();
      expect(await prisma.auditLog.count({ where: { entity: 'Sale', entityId: id, action: 'CANCEL' } })).toBe(1);
      expect((await as('owner').post(`/sales/${id}/cancel`, { reason: 'Encore' })).status).toBe(400);
    });

    it('mouvement manuel et clôture avec justification obligatoire de l’écart', async () => {
      expect((await as('cashier').post('/cash/movements', { type: 'OUT', amount: 1000000, label: 'Trop' })).status).toBe(400);
      expect((await as('cashier').post('/cash/movements', { type: 'OUT', amount: 2000, label: 'Achat eau minérale clients' })).status).toBe(201);
      const cur = (await as('cashier').get('/cash/current')).body;
      // 20 000 + 5 000 (acompte) + 6 000 (vente karité) − 6 000 (remboursement) − 2 000 = 23 000
      expect(cur.theoretical).toBe(23000);
      expect((await as('cashier').post('/cash/close', { countedAmount: 22500 })).status).toBe(400);
      const r = await as('cashier').post('/cash/close', { countedAmount: 22500, differenceReason: 'Monnaie rendue en trop' });
      expect(r.status).toBe(201);
      expect(r.body.difference).toBe(-500);
      expect(r.body.expectedAmount).toBe(23000);
    });
  });

  // ───────────────────────── Comptabilité ─────────────────────────
  describe('Comptabilité, commissions, trésorerie', () => {
    it('dépenses payées et dettes ; espèces exigent une caisse ouverte', async () => {
      const cats = (await as('owner').get('/finance/expense-categories')).body;
      const cat = (c: string) => cats.find((x: any) => x.code === c).id;
      expect((await as('owner').post('/finance/expenses', { categoryId: cat('ELECTRICITE'), label: 'Facture SONABEL', amount: 18500, expenseDate: today, method: 'CASH' })).status).toBe(400);
      expect((await as('owner').post('/finance/expenses', { categoryId: cat('ELECTRICITE'), label: 'Facture SONABEL', amount: 18500, expenseDate: today, method: 'ORANGE_MONEY', reference: 'OM-1' })).status).toBe(201);
      const loyer = await as('owner').post('/finance/expenses', { categoryId: cat('LOYER'), label: 'Loyer du mois', amount: 75000, expenseDate: today, paidAmount: 0 });
      expect(loyer.body.status).toBe('UNPAID');
      ids.loyer = loyer.body.id;
      expect((await as('cashier').post('/finance/expenses', { categoryId: cat('EAU'), label: 'x', amount: 1, expenseDate: today })).status).toBe(403);
    });

    it('règlement des commissions → dépense Commissions générée', async () => {
      const sum = (await as('owner').get('/commissions/summary')).body.staff;
      const awa = sum.find((s: any) => s.staffId === ids.staffAwa);
      expect(awa.due).toBe(5400);
      const r = await as('owner').post('/commissions/payouts', { staffId: ids.staffAwa, method: 'ORANGE_MONEY' });
      expect(r.status).toBe(201);
      expect(r.body.amount).toBe(5400);
      const exp = await prisma.expense.findUniqueOrThrow({ where: { id: r.body.expenseId }, include: { category: true } });
      expect(exp.category.code).toBe('COMMISSIONS');
      expect((await as('owner').post('/commissions/payouts', { staffId: ids.staffAwa, method: 'CASH' })).status).toBe(400);
      // Le coiffeur ne voit que ses commissions
      const mine = (await as('stylist').get('/commissions')).body as any[];
      expect(mine.every((c) => c.staffId === ids.staffAli)).toBe(true);
      expect((await as('stylist').post('/commissions/payouts', { staffId: ids.staffAli, method: 'CASH' })).status).toBe(403);
    });

    it('distingue CA, encaissements, charges, résultat et bénéfice estimé', async () => {
      const s = (await as('owner').get(`/finance/summary?period=day&date=${today}`)).body;
      // CA = 19 000 + 13 950 (la vente annulée n'est pas comptée)
      expect(s.revenue.total).toBe(32950);
      expect(s.revenue.products).toBe(9000);
      expect(s.revenue.services).toBe(23950);
      // Encaissements nets = 5 000 + 14 000 + 13 950 + 6 000 − 6 000
      expect(s.cash.totalIn).toBe(32950);
      // Charges : électricité 18 500 + loyer 75 000 + commissions réglées 5 400 (l'achat de stock n'en fait pas partie)
      expect(s.totalExpenses).toBe(98900);
      // Coût des produits vendus : 2 × 3 200 (CMUP figé à la vente) ; consommations : 2 karité × 1 000
      expect(s.costOfGoodsSold).toBe(6400);
      expect(s.stockConsumption).toBe(2000);
      expect(s.accountingResult).toBe(32950 - 6400 - 2000 - 98900);
      // Commissions dues non réglées : Ali 3 000 + Ibrahim 500
      expect(s.commissionsProvision).toBe(3500);
      expect(s.estimatedProfit).toBe(s.accountingResult - 3500);
      // Décaissements : électricité 18 500 + commissions 5 400 (le loyer et l'achat ne sont pas payés)
      expect(s.cash.totalOut).toBe(23900);
    });

    it('trésorerie par moyen de paiement et créances', async () => {
      const t = (await as('owner').get('/finance/treasury')).body;
      const acc = (m: string) => t.accounts.find((a: any) => a.method === m).balance;
      expect(acc('CASH')).toBe(5000 + 6000 - 6000 - 2000 - 500); // flux espèces + mouvement manuel + écart
      expect(acc('ORANGE_MONEY')).toBe(14000 - 18500 - 5400);
      expect(acc('MOOV_MONEY')).toBe(13950);
      expect((await as('owner').get('/finance/receivables')).body.total).toBe(0);
    });

    it('paiement partiel d’une dette fournisseur', async () => {
      expect((await as('stock').post(`/stock/purchases/${ids.purchase}/pay`, { amount: 20000, method: 'BANK_TRANSFER' })).status).toBe(400);
      expect((await as('stock').post(`/stock/purchases/${ids.purchase}/pay`, { amount: 7000, method: 'BANK_TRANSFER', reference: 'VIR-1' })).status).toBe(201);
      expect((await as('owner').get('/finance/payables')).body.total).toBe(10000 + 75000);
    });
  });

  // ───────────────────────── Inventaire, fidélité ─────────────────────────
  describe('Inventaire et fidélité', () => {
    it('inventaire : écarts appliqués en mouvements', async () => {
      const r = await as('stock').post('/stock/inventories', { lines: [{ productId: ids.gel, countedQty: 7 }, { productId: ids.karite, countedQty: 8 }] });
      expect(r.status).toBe(201);
      expect(r.body.lines.find((l: any) => l.productId === ids.gel).difference).toBe(-1);
      expect((await prisma.product.findUniqueOrThrow({ where: { id: ids.gel } })).quantity).toBe(7);
      const alerts = (await as('stock').get('/stock/alerts')).body;
      expect(alerts.length).toBe(0);
    });

    it('vente d’un forfait mensuel puis consommation des passages', async () => {
      const pk = (await as('cashier').get('/loyalty/packages')).body.find((p: any) => p.code === 'LOCKS-M');
      const r = await as('cashier').post('/sales', { clientId: ids.clientBoukary, items: [{ type: 'PACKAGE', packageId: pk.id, quantity: 1 }], payments: [{ method: 'ORANGE_MONEY', amount: 12000, reference: 'OM-PK' }] });
      expect(r.status).toBe(201);
      const subs = (await as('owner').get(`/loyalty/subscriptions?clientId=${ids.clientBoukary}`)).body;
      expect(subs).toHaveLength(1);
      expect(subs[0].visitsTotal).toBe(2);
      const use = () => as('cashier').post(`/loyalty/subscriptions/${subs[0].id}/use`, { serviceId: pk.serviceIds[0], staffId: ids.staffAli });
      expect((await use()).status).toBe(201);
      expect((await use()).status).toBe(201);
      expect((await use()).status).toBe(400);
    });

    it('utilisation des points de fidélité selon les règles configurées', async () => {
      expect((await as('owner').put('/settings/loyalty', { minRedeemPoints: 10, pointValue: 50 })).status).toBe(200);
      const s = await svc('COH03'); // 2 500 FCFA
      const r = await as('cashier').post('/sales', { clientId: ids.clientBoukary, items: [{ type: 'SERVICE', serviceId: s.id, staffId: ids.staffIbra, quantity: 1 }], loyaltyPoints: 19, payments: [{ method: 'MOOV_MONEY', amount: 1550, reference: 'MM-2' }] });
      expect(r.status).toBe(201);
      expect(r.body.loyaltyDiscount).toBe(950);
      expect(r.body.total).toBe(1550);
      // 19 (1re vente) + 12 (forfait 12 000) − 19 utilisés + 1 gagné (1 550 FCFA)
      expect((await prisma.client.findUniqueOrThrow({ where: { id: ids.clientBoukary } })).loyaltyPoints).toBe(13);
    });

    it('ajustement manuel des points (propriétaire)', async () => {
      const r = await as('owner').post('/loyalty/adjust', { clientId: ids.clientMariam, points: 50, reason: 'Geste commercial anniversaire' });
      expect(r.status).toBe(201);
      expect((await as('owner').post('/loyalty/adjust', { clientId: ids.clientMariam, points: -1000, reason: 'Retrait abusif' })).status).toBe(400);
    });
  });

  // ───────────────────────── Hors connexion ─────────────────────────
  describe('Synchronisation hors connexion', () => {
    it('applique, détecte les doublons et les conflits', async () => {
      await as('cashier').post('/cash/open', { openingAmount: 10000 });
      const opClient = randomUUID();
      const opSale = randomUUID();
      const opAppt = randomUUID();
      const coupe = await svc('COH01');
      const ops = [
        { opId: opClient, type: 'client.create', payload: { firstName: 'Issouf', lastName: 'Nikiéma', phone: '65 00 11 22', gender: 'MALE' }, createdAt: new Date().toISOString() },
        { opId: opSale, type: 'sale.create', payload: { items: [{ type: 'SERVICE', serviceId: coupe.id, staffId: ids.staffIbra, quantity: 1 }], payments: [{ method: 'CASH', amount: 1000 }] }, refs: { clientId: opClient }, createdAt: new Date().toISOString() },
        { opId: opAppt, type: 'appointment.create', payload: { clientId: ids.clientMariam, staffId: ids.staffAli, startAt: `${today}T09:30:00.000Z`, serviceIds: [coupe.id] } },
      ];
      const r = await as('cashier').post('/sync', { deviceId: 'android-test', operations: ops });
      expect(r.status).toBe(201);
      expect(r.body.results.map((x: any) => x.status)).toEqual(['APPLIED', 'APPLIED', 'CONFLICT']);
      const sale = await prisma.sale.findUniqueOrThrow({ where: { clientOpId: opSale }, include: { client: true } });
      expect(sale.client?.firstName).toBe('Issouf');
      // Renvoi du même lot (réseau coupé pendant la réponse) : aucun doublon
      const r2 = await as('cashier').post('/sync', { deviceId: 'android-test', operations: ops });
      expect(r2.body.results.map((x: any) => x.status)).toEqual(['DUPLICATE', 'DUPLICATE', 'CONFLICT']);
      expect(await prisma.sale.count({ where: { clientOpId: opSale } })).toBe(1);
      expect(await prisma.client.count({ where: { phone: '65001122' } })).toBe(1);
      // Permission revérifiée
      const r3 = await as('stock').post('/sync', { operations: [{ opId: randomUUID(), type: 'sale.create', payload: { items: [] } }] });
      expect(r3.body.results[0].status).toBe('REJECTED');
      expect((await as('cashier').get('/sync/history')).body.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ───────────────────────── Tableau de bord & rapports ─────────────────────────
  describe('Tableau de bord et rapports', () => {
    it('indicateurs issus de la base', async () => {
      const r = await as('owner').get(`/dashboard?period=month&date=${today}`);
      expect(r.status).toBe(200);
      expect(r.body.kpis.revenueToday).toBe(32950 + 12000 + 1550 + 1000);
      expect(r.body.kpis.clientsTotal).toBe(4);
      expect(r.body.kpis.cash.open).toBe(true);
      expect(r.body.kpis.cash.theoretical).toBe(11000);
      expect(r.body.charts.topServices.length).toBeGreaterThan(0);
      expect(r.body.charts.staff.length).toBe(3);
      for (const p of ['day', 'week', 'year']) expect((await as('owner').get(`/dashboard?period=${p}`)).status).toBe(200);
    });

    it('tous les rapports en JSON, et exports CSV / Excel / PDF', async () => {
      const catalog = (await as('owner').get('/reports')).body;
      expect(catalog.length).toBe(13);
      for (const rep of catalog) {
        const r = await as('owner').get(`/reports/${rep.key}?period=month&date=${today}`);
        expect([rep.key, r.status]).toEqual([rep.key, 200]);
        expect(Array.isArray(r.body.rows)).toBe(true);
      }
      const csv = await as('owner').get(`/reports/sales?period=day&format=csv`);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.text).toContain('Facture');
      const xlsx = await as('owner').get(`/reports/expenses?period=month&format=xlsx`).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
      expect(xlsx.status).toBe(200);
      expect((xlsx.body as Buffer).slice(0, 2).toString()).toBe('PK');
      for (const k of ['result', 'stock', 'attendance', 'commissions']) {
        const pdf = await as('owner').get(`/reports/${k}?period=month&format=pdf`);
        expect([k, pdf.status, pdf.headers['content-type']]).toEqual([k, 200, 'application/pdf']);
      }
      // Rapport refusé sans permission
      expect((await as('stock').get('/reports/sales')).status).toBe(403);
    });
  });

  // ───────────────────────── Sécurité & sauvegarde ─────────────────────────
  describe('Sécurité et sauvegarde', () => {
    it('désactivation d’un compte : jetons invalidés immédiatement', async () => {
      expect((await as('stylist').get('/auth/me')).status).toBe(200);
      expect((await as('owner').patch(`/users/${ids.stylistUser}`, { active: false })).status).toBe(200);
      expect((await as('stylist').get('/auth/me')).status).toBe(401);
      expect((await http.post('/api/auth/login').send({ username: 'ali', password: 'Temp2026x' })).status).toBe(401);
    });

    it('verrouillage après 5 échecs', async () => {
      for (let i = 0; i < 5; i++) await http.post('/api/auth/login').send({ username: 'magasin', password: 'mauvais' });
      const r = await http.post('/api/auth/login').send({ username: 'magasin', password: 'Temp2026x' });
      expect(r.status).toBe(401);
      expect(r.body.message).toContain('verrouillé');
    });

    it('impossible de désactiver le dernier propriétaire ou soi-même', async () => {
      const me = (await as('owner').get('/auth/me')).body;
      expect((await as('owner').patch(`/users/${me.id}`, { active: false })).status).toBe(400);
    });

    it('sauvegarde PostgreSQL manuelle', async () => {
      const r = await as('owner').post('/backups');
      expect(r.status).toBe(201);
      expect(r.body.file).toMatch(/\.dump$/);
      expect(r.body.size).toBeGreaterThan(1000);
      expect((await as('cashier').post('/backups')).status).toBe(403);
      expect((await as('owner').get('/backups/..%2F..%2Fetc%2Fpasswd')).status).toBe(400);
    });

    it('journal des actions complet', async () => {
      const r = await as('owner').get('/audit?pageSize=500');
      const actions = new Set(r.body.items.map((x: any) => x.action));
      for (const a of ['LOGIN', 'CREATE', 'UPDATE', 'CANCEL', 'PAYMENT', 'CASH_OPEN', 'CASH_CLOSE', 'COMMISSION_PAYOUT', 'INVENTORY', 'DEACTIVATE', 'BACKUP']) expect([a, actions.has(a)]).toEqual([a, true]);
      expect(JSON.stringify(r.body)).not.toContain('Temp2026x');
    });
  });
});
