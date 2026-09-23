import { DateTime } from 'luxon';
import { Account, bearer, createTestContext, inviteAndAccept, signupOwner, TestContext, uniquePhone } from './helpers';

/**
 * Parcours complet d'un salon : prestations → équipe → clients → rendez-vous → caisse
 * → dépenses → stock → rapports → tableau de bord, puis isolation avec un autre salon.
 */
describe('Application du salon', () => {
  let ctx: TestContext;
  let owner: Account & { tenantId: string };
  let receptionist: Account & { membershipId: string };
  let stylist: Account & { membershipId: string };
  let salonId: string;
  let ownerStaffId: string;
  let binta: string;
  let clientId: string;
  let coloration: { id: string; variants: { id: string }[] };
  let nattes: string;
  let coupe: string;
  let productId: string;
  let appointmentId: string;
  const zone = 'Africa/Ouagadougou';
  const today = DateTime.now().setZone(zone).toISODate()!;
  // Prochain jour ouvré (lundi–samedi) à partir de demain.
  let day = DateTime.now().setZone(zone).plus({ days: 1 }).startOf('day');
  if (day.weekday === 7) day = day.plus({ days: 1 });
  const at = (hhmm: string) => day.set({ hour: Number(hhmm.slice(0, 2)), minute: Number(hhmm.slice(3)) }).toISO()!;

  const api = () => ctx.http();
  const get = (account: { accessToken: string }, url: string) => api().get(`/api/v1${url}`).set(bearer(account));
  const post = (account: { accessToken: string }, url: string, body?: object) => api().post(`/api/v1${url}`).set(bearer(account)).send(body ?? {});

  beforeAll(async () => {
    ctx = await createTestContext();
    owner = await signupOwner(ctx, { businessName: 'Salon Kadi', salonName: 'Kadi Centre' });
    salonId = (await get(owner, '/salons').expect(200)).body[0].id;
    // Le réceptionniste ne peut pas valider seul un Mobile Money (règle choisie par ce salon).
    const roles = (await get(owner, '/roles').expect(200)).body;
    const receptionistRole = roles.find((r: { code: string }) => r.code === 'RECEPTIONIST');
    await api()
      .patch(`/api/v1/roles/${receptionistRole.id}`)
      .set(bearer(owner))
      .send({ permissions: receptionistRole.permissions.filter((p: string) => p !== 'payments.validate') })
      .expect(200);
    receptionist = await inviteAndAccept(ctx, owner, 'RECEPTIONIST', { allSalons: true, salonIds: [] });
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('prestations', () => {
    it('crée les catégories et prestations (étapes, temps de pose, variantes)', async () => {
      const category = (await post(owner, '/service-categories', { name: 'Coiffure' }).expect(201)).body;
      coloration = (
        await post(owner, '/services', {
          categoryId: category.id,
          name: 'Coloration',
          basePrice: 10_000,
          durationMinutes: 90,
          steps: [
            { label: 'Application', durationMinutes: 30, blocksStaff: true },
            { label: 'Pose', durationMinutes: 40, blocksStaff: false },
            { label: 'Rinçage', durationMinutes: 20, blocksStaff: true },
          ],
          variants: [{ name: 'Cheveux longs', price: 15_000, durationMinutes: 120 }],
        }).expect(201)
      ).body;
      nattes = (await post(owner, '/services', { categoryId: category.id, name: 'Nattes collées', basePrice: 5_000, durationMinutes: 60 }).expect(201)).body.id;
      coupe = (await post(owner, '/services', { categoryId: category.id, name: 'Coupe', basePrice: 3_000, durationMinutes: 40 }).expect(201)).body.id;

      await post(owner, '/services', { categoryId: category.id, name: 'Mauvaise', basePrice: 1, durationMinutes: 60, steps: [{ label: 'A', durationMinutes: 30, blocksStaff: true }] }).expect(400);
      const list = (await get(owner, '/services').expect(200)).body;
      expect(list).toHaveLength(3);
      // Toute l'équipe active (propriétaire + réceptionniste) est affectée d'office.
      expect(list[0].staffSkills.length).toBe(2);
    });

    it('seul un rôle avec « Modifier les prix » change un tarif', async () => {
      await api().patch(`/api/v1/services/${coupe}`).set(bearer(receptionist)).send({ basePrice: 1 }).expect(403);
      const updated = await api().patch(`/api/v1/services/${coupe}`).set(bearer(owner)).send({ basePrice: 3_500 }).expect(200);
      expect(updated.body.basePrice).toBe(3_500);
    });
  });

  describe('employés', () => {
    it('crée un employé sans compte avec planning par défaut et prestations', async () => {
      const staff = (await post(owner, '/staff', { displayName: 'Binta', salonIds: [salonId], serviceIds: [coloration.id, nattes, coupe], contractType: 'FREELANCE' }).expect(201)).body;
      binta = staff.id;
      expect(staff.hasAccount).toBe(false);
      expect(staff.schedules).toHaveLength(6); // lundi–samedi, repris des horaires du salon
      const all = (await get(owner, '/staff').expect(200)).body;
      ownerStaffId = all.find((s: { id: string }) => s.id !== binta).id;
    });

    it('enregistre une absence et un planning', async () => {
      await api()
        .put(`/api/v1/staff/${binta}/schedule`)
        .set(bearer(owner))
        .send({ salonId, entries: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startsAt: '08:00', endsAt: '18:00' })) })
        .expect(200);
      const off = await post(owner, `/staff/${binta}/time-off`, { type: 'BREAK', startsAt: at('13:00'), endsAt: at('14:00'), note: 'Pause' }).expect(201);
      expect(off.body.conflictingAppointments).toBe(0);
    });

    it('définit une règle de commission (30 % des prestations de Binta)', async () => {
      await post(owner, '/commission-rules', { staffId: binta, appliesTo: 'SERVICE', type: 'PERCENT', value: 30 }).expect(201);
      await post(owner, '/commission-rules', { appliesTo: 'SERVICE', type: 'PERCENT', value: 150 }).expect(400);
    });
  });

  describe('clients', () => {
    it('crée, recherche et protège les doublons', async () => {
      const client = (await post(receptionist, '/clients', { fullName: 'Fatou Ouédraogo', phone: '70 11 22 33', marketingConsent: true }).expect(201)).body;
      clientId = client.id;
      expect(client.clientNumber).toBe('C-00001');
      expect(client.consents.MARKETING_WHATSAPP.granted).toBe(true);
      await post(receptionist, '/clients', { fullName: 'Autre', phone: '+22670112233' }).expect(409);

      expect((await get(receptionist, '/clients?q=fatou').expect(200)).body.total).toBe(1);
      expect((await get(receptionist, '/clients?q=1122').expect(200)).body.items[0].id).toBe(clientId);
    });

    it('chiffre la fiche technique en base', async () => {
      await post(owner, `/clients/${clientId}/technical-notes`, { kind: 'allergie', content: 'Allergie au PPD' }).expect(201);
      const stored = await ctx.admin.clientTechnicalNote.findFirstOrThrow({ where: { clientId } });
      expect(stored.contentEnc).not.toContain('PPD');
      const notes = (await get(owner, `/clients/${clientId}/technical-notes`).expect(200)).body;
      expect(notes[0].content).toBe('Allergie au PPD');
      // Réceptionniste : lecture autorisée, écriture non.
      await post(receptionist, `/clients/${clientId}/technical-notes`, { kind: 'soin', content: 'x' }).expect(403);
    });
  });

  describe('rendez-vous', () => {
    it('propose les créneaux en tenant compte du planning et des absences', async () => {
      const res = (await get(receptionist, `/appointments/availability?salonId=${salonId}&date=${day.toISODate()}&serviceId=${nattes}&staffId=${binta}`).expect(200)).body;
      const slots: string[] = res.staff[0].slots;
      const times = slots.map((s) => DateTime.fromISO(s).setZone(zone).toFormat('HH:mm'));
      expect(times[0]).toBe('08:00');
      expect(times).not.toContain('12:30'); // finirait pendant la pause de 13 h
      expect(times).not.toContain('13:00');
      expect(times).toContain('14:00');
      expect(times[times.length - 1]).toBe('17:00'); // Binta termine à 18 h
    });

    it('réserve une coloration et laisse le coiffeur libre pendant la pose', async () => {
      const appointment = (await post(receptionist, '/appointments', { salonId, clientId, startsAt: at('10:00'), items: [{ serviceId: coloration.id, staffId: binta }] }).expect(201)).body;
      appointmentId = appointment.id;
      expect(appointment.status).toBe('CONFIRMED');
      expect(appointment.estimatedTotal).toBe(10_000);
      expect(DateTime.fromISO(appointment.endsAt).setZone(zone).toFormat('HH:mm')).toBe('11:30');

      // 10:30–11:10 = temps de pose : une coupe de 40 min tient.
      await post(receptionist, '/appointments', { salonId, startsAt: at('10:30'), items: [{ serviceId: coupe, staffId: binta }] }).expect(201);
      // Des nattes de 60 min à 10:30 chevaucheraient le rinçage de 11:10 : refusé.
      await post(receptionist, '/appointments', { salonId, startsAt: at('10:30'), items: [{ serviceId: nattes, staffId: binta }] }).expect(409);
      // Même créneau que la coloration : refusé.
      await post(receptionist, '/appointments', { salonId, startsAt: at('10:00'), items: [{ serviceId: nattes, staffId: binta }] }).expect(409);
    });

    it('refuse hors planning, sauf forçage par qui gère l’agenda', async () => {
      await post(receptionist, '/appointments', { salonId, startsAt: at('19:00'), items: [{ serviceId: coupe, staffId: binta }] }).expect(409);
      // Sans la permission de gérer l'agenda, pas de forçage.
      const limited = await inviteAndAccept(ctx, owner, 'STYLIST', { allSalons: true, salonIds: [] });
      const roles = (await get(owner, '/roles').expect(200)).body;
      const bookerRole = roles.find((r: { code: string }) => r.code === 'STYLIST');
      await api()
        .patch(`/api/v1/roles/${bookerRole.id}`)
        .set(bearer(owner))
        .send({ permissions: [...bookerRole.permissions, 'appointments.create'] })
        .expect(200);
      const renewed = await api().post('/api/v1/auth/refresh').set('Cookie', limited.cookie).set('X-Requested-With', 'test').expect(200);
      await post(renewed.body, '/appointments', { salonId, startsAt: at('19:00'), items: [{ serviceId: coupe, staffId: binta }], force: true }).expect(403);
      await post(receptionist, '/appointments', { salonId, startsAt: at('19:00'), items: [{ serviceId: coupe, staffId: binta }], force: true }).expect(201);
      // Remise en état du rôle coiffeur pour la suite.
      await api().patch(`/api/v1/roles/${bookerRole.id}`).set(bearer(owner)).send({ permissions: bookerRole.permissions }).expect(200);
    });

    it("libère le créneau à l'annulation", async () => {
      const a = (await post(receptionist, '/appointments', { salonId, startsAt: at('15:00'), items: [{ serviceId: nattes, staffId: binta }] }).expect(201)).body;
      await post(receptionist, `/appointments/${a.id}/status`, { status: 'CANCELLED_BY_CLIENT', reason: 'Empêchement' }).expect(200);
      await post(receptionist, '/appointments', { salonId, startsAt: at('15:00'), items: [{ serviceId: nattes, staffId: binta }] }).expect(201);
      await post(receptionist, `/appointments/${a.id}/status`, { status: 'CONFIRMED' }).expect(409);
    });

    it('déplace un rendez-vous', async () => {
      const a = (await post(receptionist, '/appointments', { salonId, startsAt: at('16:00'), items: [{ serviceId: coupe, staffId: ownerStaffId }] }).expect(201)).body;
      const moved = (await api().patch(`/api/v1/appointments/${a.id}`).set(bearer(owner)).send({ startsAt: at('08:00') }).expect(200)).body;
      expect(DateTime.fromISO(moved.startsAt).setZone(zone).toFormat('HH:mm')).toBe('08:00');
      // L'ancien créneau est de nouveau libre.
      await post(receptionist, '/appointments', { salonId, startsAt: at('16:00'), items: [{ serviceId: coupe, staffId: ownerStaffId }] }).expect(201);
    });

    it('un coiffeur ne voit que son propre agenda', async () => {
      stylist = await inviteAndAccept(ctx, owner, 'STYLIST', { allSalons: true, salonIds: [] });
      const agenda = (await get(stylist, `/appointments/agenda?salonId=${salonId}&date=${day.toISODate()}`).expect(200)).body;
      expect(agenda.staff).toHaveLength(1);
      expect(agenda.appointments).toHaveLength(0);
      await get(stylist, `/appointments/${appointmentId}`).expect(404);

      const full = (await get(receptionist, `/appointments/agenda?salonId=${salonId}&date=${day.toISODate()}`).expect(200)).body;
      expect(full.staff.length).toBeGreaterThanOrEqual(3);
      expect(full.appointments.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('stock', () => {
    it('crée un produit, réceptionne et fixe un seuil', async () => {
      const supplier = (await post(owner, '/suppliers', { name: 'Cosmétiques du Faso' }).expect(201)).body;
      productId = (await post(owner, '/products', { name: 'Huile de karité', kind: 'RETAIL', purchasePrice: 1_500, salePrice: 3_000, supplierId: supplier.id }).expect(201)).body.id;
      await post(owner, '/stock/receipts', { salonId, supplierId: supplier.id, lines: [{ productId, quantity: 10, unitCost: 1_500 }] }).expect(201);
      await api().put(`/api/v1/products/${productId}/threshold`).set(bearer(owner)).send({ salonId, alertThreshold: 5 }).expect(200);
      const products = (await get(owner, `/products?salonId=${salonId}`).expect(200)).body;
      expect(products[0].stocks[0].quantity).toBe('10');
    });

    it('inventaire et perte sont tracés', async () => {
      await post(owner, '/stock/adjustments', { salonId, productId, mode: 'LOSS', quantity: 1, reason: 'Flacon cassé' }).expect(201);
      const count = (await post(owner, '/stock/adjustments', { salonId, productId, mode: 'COUNT', quantity: 10, reason: 'Inventaire' }).expect(201)).body;
      expect(count.delta).toBe('1');
      const movements = (await get(owner, `/stock/movements?productId=${productId}`).expect(200)).body;
      expect(movements.map((m: { type: string }) => m.type)).toEqual(['ADJUSTMENT', 'LOSS', 'PURCHASE_RECEIPT']);
    });
  });

  describe('caisse', () => {
    let saleId: string;
    let secondSaleId: string;
    let sessionId: string;

    it('refuse un paiement en espèces caisse fermée', async () => {
      await post(receptionist, '/sales', { salonId, items: [{ type: 'SERVICE', serviceId: coupe, staffId: binta }], payments: [{ method: 'CASH', amount: 3_500 }] }).expect(409);
    });

    it('ouvre la caisse puis encaisse le rendez-vous, un produit et un pourboire', async () => {
      sessionId = (await post(receptionist, '/cash/sessions', { salonId, openingFloat: 10_000 }).expect(201)).body.id;
      await post(receptionist, '/cash/sessions', { salonId, openingFloat: 0 }).expect(409);

      const appointment = (await get(receptionist, `/appointments/${appointmentId}`).expect(200)).body;
      const sale = (
        await post(receptionist, '/sales', {
          salonId,
          appointmentId,
          items: [
            { type: 'SERVICE', appointmentItemId: appointment.items[0].id },
            { type: 'PRODUCT', productId, quantity: 2, staffId: binta },
          ],
          tips: [{ staffId: binta, amount: 500 }],
          payments: [{ method: 'CASH', amount: 16_500 }],
        }).expect(201)
      ).body;
      saleId = sale.id;
      expect(sale.status).toBe('PAID');
      expect(sale.number).toMatch(/^V-\d{4}-000001$/);
      expect(sale.total).toBe(16_000);
      expect(sale.tipTotal).toBe(500);

      // Effets : rendez-vous terminé, stock décrémenté, commission, fiche client.
      expect((await get(receptionist, `/appointments/${appointmentId}`).expect(200)).body.status).toBe('COMPLETED');
      expect((await get(owner, `/products?salonId=${salonId}`).expect(200)).body[0].stocks[0].quantity).toBe('8');
      const commissions = await ctx.admin.commissionEntry.findMany({ where: { staffId: binta } });
      expect(commissions.map((c) => Number(c.amount))).toEqual([3_000]);
      const client = (await get(owner, `/clients/${clientId}`).expect(200)).body;
      expect(client.visitCount).toBe(1);
      expect(client.totalSpent).toBe(16_000);
      // Un rendez-vous ne s'encaisse qu'une fois.
      await post(receptionist, '/sales', { salonId, appointmentId, items: [{ type: 'SERVICE', serviceId: coupe }], payments: [{ method: 'CASH', amount: 3_500 }] }).expect(409);
    });

    it('contrôle les montants, les remises et les prix', async () => {
      await post(receptionist, '/sales', { salonId, items: [{ type: 'SERVICE', serviceId: coupe }], payments: [{ method: 'CASH', amount: 3_000 }] }).expect(400);
      await post(receptionist, '/sales', { salonId, items: [{ type: 'SERVICE', serviceId: coupe, unitPrice: 100 }], payments: [{ method: 'CASH', amount: 100 }] }).expect(403);
      // Remise plafonnée à 20 % pour le réceptionniste.
      await post(receptionist, '/sales', { salonId, items: [{ type: 'SERVICE', serviceId: coupe }], discount: 1_000, payments: [{ method: 'CASH', amount: 2_500 }] }).expect(403);
      const ok = (await post(receptionist, '/sales', { salonId, items: [{ type: 'SERVICE', serviceId: coupe, staffId: ownerStaffId }], discount: 500, payments: [{ method: 'CASH', amount: 3_000 }] }).expect(201)).body;
      secondSaleId = ok.id;
      expect(ok.discountTotal).toBe(500);
    });

    it('Mobile Money manuel : en attente puis validé par un responsable ; référence unique', async () => {
      const pending = (
        await post(receptionist, '/sales', { salonId, clientId, items: [{ type: 'SERVICE', serviceId: nattes, staffId: binta }], payments: [{ method: 'MOBILE_MONEY_MANUAL', amount: 5_000, reference: 'OM-TX-123456', operator: 'Orange Money' }] }).expect(201)
      ).body;
      expect(pending.status).toBe('OPEN');
      await post(receptionist, '/sales', { salonId, items: [{ type: 'SERVICE', serviceId: nattes }], payments: [{ method: 'MOBILE_MONEY_MANUAL', amount: 5_000, reference: 'OM-TX-123456' }] }).expect(409);

      const queue = (await get(owner, `/payments/pending?salonId=${salonId}`).expect(200)).body;
      expect(queue).toHaveLength(1);
      await post(receptionist, `/payments/${queue[0].id}/validate`).expect(403);
      const validated = (await post(owner, `/payments/${queue[0].id}/validate`).expect(200)).body;
      expect(validated.status).toBe('PAID');
    });

    it('dépense en espèces et dépôt en banque sortent de la caisse', async () => {
      const categories = (await get(owner, '/expense-categories').expect(200)).body;
      const electricity = categories.find((c: { name: string }) => c.name === 'Électricité');
      await post(receptionist, '/expenses', { salonId, categoryId: electricity.id, label: 'Facture SONABEL', amount: 2_000, paymentMethod: 'CASH', spentAt: today }).expect(201);
      await post(owner, '/cash/movements', { salonId, type: 'BANK_DEPOSIT', amount: 5_000, reason: 'Dépôt à la banque' }).expect(201);
      await post(owner, '/cash/movements', { salonId, type: 'CASH_OUT', amount: 1_000_000, reason: 'Trop' }).expect(409);

      // 10 000 + 16 500 + 3 000 − 2 000 − 5 000
      const session = (await get(owner, `/cash/current?salonId=${salonId}`).expect(200)).body;
      expect(session.expectedCash).toBe(22_500);
      expect(session.paymentsByMethod).toEqual({ CASH: 19_500, MOBILE_MONEY_MANUAL: 5_000 });

      // Le réceptionniste ne voit que ses propres dépenses et ne peut pas en supprimer.
      expect((await get(receptionist, '/expenses').expect(200)).body).toHaveLength(1);
      const expenseId = (await get(owner, '/expenses').expect(200)).body[0].id;
      await api().delete(`/api/v1/expenses/${expenseId}`).set(bearer(receptionist)).send({ reason: 'Erreur' }).expect(403);
    });

    it("annule une vente : écritures inverses, produit remis en stock, argent rendu", async () => {
      await post(receptionist, `/sales/${secondSaleId}/void`, { reason: 'Erreur' }).expect(403);
      const voided = (await post(owner, `/sales/${secondSaleId}/void`, { reason: 'Erreur de saisie' }).expect(200)).body;
      expect(voided.status).toBe('VOIDED');
      const session = (await get(owner, `/cash/current?salonId=${salonId}`).expect(200)).body;
      expect(session.expectedCash).toBe(19_500);
      await post(owner, `/sales/${secondSaleId}/void`, { reason: 'Encore' }).expect(409);

      // Le registre reste équilibré (sinon PostgreSQL aurait refusé la transaction).
      const sums = await ctx.admin.ledgerEntry.aggregate({ where: { tenantId: owner.tenantId }, _sum: { debit: true, credit: true } });
      expect(sums._sum.debit).toEqual(sums._sum.credit);
    });

    it('clôture : un écart exige une justification', async () => {
      await post(receptionist, `/cash/sessions/${sessionId}/close`, { countedCash: 19_000 }).expect(400);
      const closed = (await post(receptionist, `/cash/sessions/${sessionId}/close`, { countedCash: 19_000, differenceReason: 'Monnaie rendue en trop' }).expect(200)).body;
      expect(closed.status).toBe('CLOSED');
      expect(closed.difference).toBe(-500);
      // Caisse fermée : plus d'annulation de vente en espèces ni de dépense en espèces.
      await post(owner, `/sales/${saleId}/void`, { reason: 'Trop tard' }).expect(409);
      const categories = (await get(owner, '/expense-categories').expect(200)).body;
      await post(owner, '/expenses', { salonId, categoryId: categories[0].id, label: 'Loyer', amount: 50_000, paymentMethod: 'CASH', spentAt: today }).expect(409);
      await post(owner, '/expenses', { salonId, categoryId: categories[0].id, label: 'Loyer', amount: 50_000, paymentMethod: 'BANK_TRANSFER', spentAt: today }).expect(201);
    });
  });

  describe('rapports et tableau de bord', () => {
    it('synthèse de la période', async () => {
      const report = (await get(owner, `/reports/summary?salonId=${salonId}&from=${today}&to=${today}`).expect(200)).body;
      expect(report.sales.count).toBe(2); // la vente annulée n'est pas comptée
      expect(report.sales.revenue).toBe(21_000); // 16 000 + 5 000
      expect(report.sales.revenueProducts).toBe(6_000);
      expect(report.sales.tips).toBe(500);
      expect(report.sales.byPaymentMethod).toEqual({ CASH: 16_500, MOBILE_MONEY_MANUAL: 5_000 });
      const bintaRow = report.staff.find((s: { staffId: string }) => s.staffId === binta);
      expect(bintaRow).toMatchObject({ revenue: 21_000, commissions: 4_500, tips: 500 });
      expect(report.topProducts[0]).toMatchObject({ label: 'Huile de karité', quantity: 2, margin: 3_000 });
      expect(report.finance).toMatchObject({ expenses: 52_000, cashDifferences: -500, net: 21_000 - 52_000 });
    });

    it('un coiffeur ne voit que ses chiffres, sans les finances', async () => {
      const report = (await get(stylist, `/reports/summary?from=${today}&to=${today}`).expect(200)).body;
      expect(report.scope).toBe('own');
      expect(report.sales.count).toBe(0);
      expect(report.finance).toBeNull();
    });

    it('tableau de bord adapté aux permissions', async () => {
      await api().put(`/api/v1/products/${productId}/threshold`).set(bearer(owner)).send({ salonId, alertThreshold: 9 }).expect(200);
      const board = (await get(owner, `/dashboard?salonId=${salonId}`).expect(200)).body;
      expect(board.cash.status).toBe('CLOSED');
      expect(board.sales).toMatchObject({ count: 2, revenue: 21_000 });
      expect(board.lowStock.count).toBe(1);
      expect(board.pendingPayments).toBe(0);

      const stylistBoard = (await get(stylist, `/dashboard?salonId=${salonId}`).expect(200)).body;
      expect(stylistBoard).not.toHaveProperty('sales');
      expect(stylistBoard).not.toHaveProperty('cash');
      expect(stylistBoard.appointments.total).toBe(0);
    });
  });

  describe('multi-salons', () => {
    it('transfère du stock entre deux salons', async () => {
      const multi = await ctx.admin.plan.findUniqueOrThrow({ where: { code: 'MULTI' } });
      await ctx.admin.tenant.update({ where: { id: owner.tenantId }, data: { planId: multi.id } });
      const second = (await post(owner, '/salons', { name: 'Kadi Annexe', city: 'Ouagadougou' }).expect(201)).body;
      await post(owner, '/stock/transfers', { fromSalonId: salonId, toSalonId: second.id, lines: [{ productId, quantity: 3 }] }).expect(201);
      await post(owner, '/stock/transfers', { fromSalonId: salonId, toSalonId: second.id, lines: [{ productId, quantity: 100 }] }).expect(409);
      const products = (await get(owner, `/products`).expect(200)).body;
      const quantities = Object.fromEntries(products[0].stocks.map((s: { salonId: string; quantity: string }) => [s.salonId, s.quantity]));
      expect(quantities).toEqual({ [salonId]: '5', [second.id]: '3' });
    });
  });

  describe('isolation', () => {
    it("un autre salon n'atteint aucune donnée de celui-ci", async () => {
      const other = await signupOwner(ctx, { businessName: 'Salon Concurrent' });
      await get(other, `/clients/${clientId}`).expect(404);
      await get(other, `/appointments/${appointmentId}`).expect(404);
      await get(other, `/staff/${binta}`).expect(404);
      await get(other, `/services/${coupe}`).expect(404);
      expect((await get(other, '/clients?q=fatou').expect(200)).body.total).toBe(0);
      expect((await get(other, '/products').expect(200)).body).toEqual([]);
      expect((await get(other, '/expenses').expect(200)).body).toEqual([]);
      expect((await get(other, '/sales').expect(200)).body).toEqual([]);

      const otherSalon = (await get(other, '/salons').expect(200)).body[0].id;
      // Réserver avec la prestation et l'employé d'un autre salon : inconnus.
      await post(other, '/appointments', { salonId: otherSalon, startsAt: at('09:00'), items: [{ serviceId: coupe, staffId: binta }] }).expect(400);
      // Utiliser le salon d'un autre : introuvable.
      await post(other, '/cash/sessions', { salonId, openingFloat: 0 }).expect(404);
      await get(other, `/dashboard?salonId=${salonId}`).expect(404);
      await get(other, `/reports/summary?salonId=${salonId}&from=${today}&to=${today}`).expect(404);
      // Encaisser en visant le client d'un autre salon : inconnu.
      await post(other, '/cash/sessions', { salonId: otherSalon, openingFloat: 0 }).expect(201);
      await post(other, '/sales', { salonId: otherSalon, clientId, items: [{ type: 'SERVICE', serviceId: coupe }], payments: [{ method: 'CASH', amount: 3_500 }] }).expect(400);
    });

    it('les numéros de vente et de client sont propres à chaque entreprise', async () => {
      const other = await signupOwner(ctx, { businessName: 'Salon Numéro' });
      const client = (await post(other, '/clients', { fullName: 'Premier client', phone: uniquePhone() }).expect(201)).body;
      expect(client.clientNumber).toBe('C-00001');
    });
  });
});
