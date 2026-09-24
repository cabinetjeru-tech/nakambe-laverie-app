import { PrismaClient } from '@prisma/client';
import { BillingEngine } from '../src/modules/billing/billing-engine.service';
import { PlatformSettingsService } from '../src/core/platform/platform-settings.service';
import { Account, TestContext, bearer, createTestContext, inviteAndAccept, refresh, refreshCookie, signupOwner, uniquePhone } from './helpers';

const DAY = 86_400_000;

describe('Abonnements, facturation et console super administrateur', () => {
  let ctx: TestContext;
  let engine: BillingEngine;

  beforeAll(async () => {
    ctx = await createTestContext();
    engine = ctx.app.get(BillingEngine);
  });
  afterAll(async () => {
    await ctx.close();
  });

  // ------------------------------------------------------------------ outils

  /** Déplace l'échéance de l'abonnement (le « temps » du test) puis lance le planificateur. */
  async function setPeriodEnd(tenantId: string, end: Date, trial = true) {
    await ctx.admin.saasSubscription.update({ where: { tenantId }, data: { currentPeriodEnd: end, currentPeriodStart: new Date(end.getTime() - 30 * DAY) } });
    if (trial) await ctx.admin.tenant.update({ where: { id: tenantId }, data: { trialEndsAt: end } });
  }

  async function run() {
    const result = await engine.runDue(new Date());
    expect(result.errors).toBe(0);
  }

  /** Jeton renouvelé (après un changement d'offre, les permissions changent). */
  async function renew(account: Account) {
    const res = await refresh(ctx, account.cookie).expect(200);
    account.accessToken = res.body.accessToken;
    account.cookie = refreshCookie(res);
    account.permissions = res.body.activeTenant?.permissions ?? account.permissions;
    return account;
  }

  async function openInvoices(tenantId: string) {
    return ctx.admin.saasInvoice.findMany({ where: { tenantId, status: 'OPEN' }, orderBy: { createdAt: 'asc' } });
  }

  async function payOnline(owner: Account, invoiceId: string, outcome: 'SUCCEEDED' | 'FAILED' = 'SUCCEEDED', amount?: number) {
    const started = await ctx.http().post(`/api/v1/billing/invoices/${invoiceId}/pay`).set(bearer(owner)).send({ method: 'ONLINE' }).expect(201);
    expect(started.body.checkoutUrl).toContain('/abonnement/paiement-test?transaction=');
    const token = new URL(started.body.checkoutUrl).searchParams.get('transaction')!;
    const done = await ctx
      .http()
      .post(`/api/v1/billing/sandbox/${token}/complete`)
      .set(bearer(owner))
      .send({ outcome, ...(amount !== undefined ? { amount } : {}) })
      .expect(201);
    return { paymentId: started.body.paymentId as string, token, status: done.body.status as string };
  }

  async function platformStaff(role: 'PLATFORM_OWNER' | 'PLATFORM_BILLING' | 'PLATFORM_SUPPORT') {
    const account = await signupOwner(ctx, { businessName: `Équipe ${role}` });
    const user = await ctx.admin.user.findUniqueOrThrow({ where: { phone: account.phone } });
    await ctx.admin.platformStaff.create({ data: { userId: user.id, role } });
    return { ...account, userId: user.id };
  }

  // ------------------------------------------------------------------ essai et renouvellement

  it("l'essai démarre à l'inscription et la page Abonnement présente offres et moyens de paiement", async () => {
    const owner = await signupOwner(ctx);
    const status = await ctx.http().get('/api/v1/billing/status').set(bearer(owner)).expect(200);
    expect(status.body).toMatchObject({ tenantStatus: 'TRIAL', subscriptionStatus: 'TRIALING', readOnly: false, canManage: true, plan: { code: 'SALON' } });
    expect(status.body.daysLeft).toBeGreaterThanOrEqual(29);

    const overview = await ctx.http().get('/api/v1/billing').set(bearer(owner)).expect(200);
    expect(overview.body.plans.map((p: { code: string }) => p.code)).toEqual(['SOLO', 'SALON', 'MULTI']);
    expect(overview.body.paymentOptions).toMatchObject({ online: true, mobileMoney: [{ operator: 'Orange Money', number: '+22670000000' }] });
    expect(overview.body.usage).toEqual({ salons: 1, staff: 1 });
  });

  it('la facture de renouvellement est émise une seule fois, avec rappels dans la cloche', async () => {
    const owner = await signupOwner(ctx);
    await setPeriodEnd(owner.tenantId, new Date(Date.now() + 5 * DAY));
    await run();
    await run();
    const invoices = await openInvoices(owner.tenantId);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ kind: 'RENEWAL', total: 15_000n, currency: 'XOF' });
    expect(invoices[0].number).toMatch(/^FS-\d{4}-\d{6}$/);

    const notifications = await ctx.http().get('/api/v1/notifications').set(bearer(owner)).expect(200);
    const events = notifications.body.map((n: { event: string }) => n.event);
    expect(events).toEqual(expect.arrayContaining(['invoice.created', 'trial.ending']));
    expect(events.filter((e: string) => e === 'trial.ending')).toHaveLength(1);

    const list = await ctx.http().get('/api/v1/billing/invoices').set(bearer(owner)).expect(200);
    expect(list.body).toHaveLength(1);
    const detail = await ctx.http().get(`/api/v1/billing/invoices/${invoices[0].id}`).set(bearer(owner)).expect(200);
    expect(detail.body.seller.legalName).toBeTruthy();
    expect(detail.body.buyerSnapshot.displayName).toBe('Beauté Divine');
  });

  it("pendant l'essai, le changement d'offre est immédiat et la facture est refaite", async () => {
    const owner = await signupOwner(ctx);
    await setPeriodEnd(owner.tenantId, new Date(Date.now() + 5 * DAY));
    await run();
    const res = await ctx.http().post('/api/v1/billing/plan').set(bearer(owner)).send({ planCode: 'SOLO', cycle: 'YEARLY' }).expect(201);
    expect(res.body.applied).toBe('now');
    // Les fonctionnalités ont changé : l'ancien jeton est refusé, le nouveau reflète l'offre Solo.
    await ctx.http().get('/api/v1/billing/status').set(bearer(owner)).expect(401);
    await renew(owner);
    expect(owner.permissions).not.toContain('stock.read');
    const invoices = await openInvoices(owner.tenantId);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ total: 50_000n, cycle: 'YEARLY' });
  });

  // ------------------------------------------------------------------ impayé, suspension, Mobile Money

  it('échéance impayée → impayé, puis suspension automatique ; un paiement Mobile Money validé réactive', async () => {
    const owner = await signupOwner(ctx);
    const other = await signupOwner(ctx);
    await setPeriodEnd(owner.tenantId, new Date(Date.now() - 3_600_000));
    await run();
    let tenant = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.status).toBe('PAST_DUE');
    expect(tenant.graceEndsAt!.getTime()).toBeGreaterThan(Date.now());
    // Délai de grâce : accès complet.
    await ctx.http().post('/api/v1/clients').set(bearer(owner)).send({ fullName: 'Mariam Ouédraogo', phone: uniquePhone() }).expect(201);

    await ctx.admin.tenant.update({ where: { id: owner.tenantId }, data: { graceEndsAt: new Date(Date.now() - 60_000) } });
    await run();
    tenant = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.status).toBe('SUSPENDED');

    // Lecture seule… sauf l'abonnement, les notifications et le support.
    const blocked = await ctx.http().post('/api/v1/clients').set(bearer(owner)).send({ fullName: 'Awa Kaboré', phone: uniquePhone() }).expect(403);
    expect(blocked.body.message).toContain('Abonnement suspendu');
    await ctx.http().get('/api/v1/clients').set(bearer(owner)).expect(200);
    const status = await ctx.http().get('/api/v1/billing/status').set(bearer(owner)).expect(200);
    expect(status.body).toMatchObject({ readOnly: true, tenantStatus: 'SUSPENDED' });
    await ctx.http().post('/api/v1/notifications/read-all').set(bearer(owner)).expect(204);

    const [invoice] = await openInvoices(owner.tenantId);
    const declared = await ctx
      .http()
      .post(`/api/v1/billing/invoices/${invoice.id}/pay`)
      .set(bearer(owner))
      .send({ method: 'MOBILE_MONEY_MANUAL', reference: 'om240925.1234.a56789', operator: 'Orange Money' })
      .expect(201);
    expect(declared.body.status).toBe('PENDING');
    // Même référence déclarée par un autre salon : refusée. Deuxième déclaration : refusée.
    await setPeriodEnd(other.tenantId, new Date(Date.now() + DAY));
    await run();
    const [otherInvoice] = await openInvoices(other.tenantId);
    await ctx.http().post(`/api/v1/billing/invoices/${otherInvoice.id}/pay`).set(bearer(other)).send({ method: 'MOBILE_MONEY_MANUAL', reference: 'OM240925.1234.A56789' }).expect(409);
    await ctx.http().post(`/api/v1/billing/invoices/${invoice.id}/pay`).set(bearer(owner)).send({ method: 'MOBILE_MONEY_MANUAL', reference: 'AUTRE-REF-1' }).expect(409);

    // L'équipe facturation valide.
    const billing = await platformStaff('PLATFORM_BILLING');
    const pending = await ctx.http().get('/api/v1/platform/payments?status=PENDING&method=MOBILE_MONEY_MANUAL').set(bearer(billing)).expect(200);
    expect(pending.body.map((p: { id: string }) => p.id)).toContain(declared.body.paymentId);
    await ctx.http().post(`/api/v1/platform/payments/${declared.body.paymentId}/validate`).set(bearer(billing)).expect(204);
    await ctx.http().post(`/api/v1/platform/payments/${declared.body.paymentId}/validate`).set(bearer(billing)).expect(409);

    tenant = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.status).toBe('ACTIVE');
    const sub = await ctx.admin.saasSubscription.findUniqueOrThrow({ where: { tenantId: owner.tenantId } });
    expect(sub.status).toBe('ACTIVE');
    // Réactivation après suspension : la nouvelle période démarre au paiement.
    expect(Math.abs(sub.currentPeriodStart.getTime() - Date.now())).toBeLessThan(60_000);
    await ctx.http().post('/api/v1/clients').set(bearer(owner)).send({ fullName: 'Awa Kaboré', phone: uniquePhone() }).expect(201);

    const audit = await ctx.admin.auditLog.findFirst({ where: { tenantId: owner.tenantId, action: 'platform.payment_validated' } });
    expect(audit?.actorUserId).toBe(billing.userId);
  });

  it('un paiement Mobile Money rejeté laisse la facture à régler', async () => {
    const owner = await signupOwner(ctx);
    await setPeriodEnd(owner.tenantId, new Date(Date.now() + 2 * DAY));
    await run();
    const [invoice] = await openInvoices(owner.tenantId);
    const declared = await ctx.http().post(`/api/v1/billing/invoices/${invoice.id}/pay`).set(bearer(owner)).send({ method: 'MOBILE_MONEY_MANUAL', reference: 'MP-REJ-000123' }).expect(201);
    const billing = await platformStaff('PLATFORM_BILLING');
    await ctx.http().post(`/api/v1/platform/payments/${declared.body.paymentId}/reject`).set(bearer(billing)).send({ reason: 'Référence introuvable sur le relevé' }).expect(204);
    const after = await ctx.admin.saasInvoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(after.status).toBe('OPEN');
    const notifications = await ctx.http().get('/api/v1/notifications').set(bearer(owner)).expect(200);
    expect(notifications.body.map((n: { event: string }) => n.event)).toContain('payment.failed');
  });

  // ------------------------------------------------------------------ paiement en ligne

  it('paiement en ligne : la période suivante démarre à l’échéance (continuité), confirmation vérifiée', async () => {
    const owner = await signupOwner(ctx);
    const end = new Date(Date.now() + 3 * DAY);
    await setPeriodEnd(owner.tenantId, end);
    await run();
    const [invoice] = await openInvoices(owner.tenantId);
    const paid = await payOnline(owner, invoice.id);
    expect(paid.status).toBe('SUCCEEDED');

    const sub = await ctx.admin.saasSubscription.findUniqueOrThrow({ where: { tenantId: owner.tenantId } });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.currentPeriodStart.getTime()).toBe(end.getTime());
    const tenant = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.status).toBe('ACTIVE');

    const status = await ctx.http().get(`/api/v1/billing/payments/${paid.paymentId}`).set(bearer(owner)).expect(200);
    expect(status.body).toMatchObject({ status: 'SUCCEEDED', invoice: { status: 'PAID' } });
    // Notification rejouée par l'agrégateur : sans effet.
    const replay = await ctx.http().post('/api/v1/billing/webhooks/sandbox').send({ cpm_trans_id: paid.token }).expect(200);
    expect(replay.body.status).toBe('SUCCEEDED');
    expect(await ctx.admin.saasPayment.count({ where: { invoiceId: invoice.id, status: 'SUCCEEDED' } })).toBe(1);
    // Identifiant inconnu : ignoré.
    await ctx.http().post('/api/v1/billing/webhooks/sandbox').send({ cpm_trans_id: 'INCONNU' }).expect(200);
  });

  it('paiement refusé ou montant falsifié : la facture reste à régler', async () => {
    const owner = await signupOwner(ctx);
    await setPeriodEnd(owner.tenantId, new Date(Date.now() + 3 * DAY));
    await run();
    const [invoice] = await openInvoices(owner.tenantId);
    expect((await payOnline(owner, invoice.id, 'FAILED')).status).toBe('FAILED');
    const forged = await payOnline(owner, invoice.id, 'SUCCEEDED', 100);
    expect(forged.status).toBe('FAILED');
    const payment = await ctx.admin.saasPayment.findUniqueOrThrow({ where: { id: forged.paymentId } });
    expect(payment.failureReason).toContain('Montant');
    expect((await ctx.admin.saasInvoice.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe('OPEN');
  });

  // ------------------------------------------------------------------ changements d'offre, résiliation

  async function activeTenant() {
    const owner = await signupOwner(ctx);
    await setPeriodEnd(owner.tenantId, new Date(Date.now() + 3 * DAY));
    await run();
    const [invoice] = await openInvoices(owner.tenantId);
    await payOnline(owner, invoice.id);
    return owner;
  }

  it("passage à une offre supérieure : facture au prorata, offre activée au paiement ; baisse bloquée par l'utilisation", async () => {
    const owner = await activeTenant();
    const res = await ctx.http().post('/api/v1/billing/plan').set(bearer(owner)).send({ planCode: 'MULTI', cycle: 'MONTHLY' }).expect(201);
    expect(res.body.applied).toBe('on_payment');
    const upgrade = await ctx.admin.saasInvoice.findUniqueOrThrow({ where: { id: res.body.invoiceId } });
    expect(upgrade.kind).toBe('UPGRADE');
    expect(upgrade.total).toBeGreaterThan(0n);
    // Différence Multi − Salon = 20 000 FCFA, au plus (période suivante payée d'avance).
    expect(upgrade.total).toBeLessThanOrEqual(20_000n);
    await payOnline(owner, upgrade.id);
    const tenant = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId }, include: { plan: true } });
    expect(tenant.plan.code).toBe('MULTI');
    await renew(owner);

    await ctx.http().post('/api/v1/salons').set(bearer(owner)).send({ name: 'Annexe', city: 'Bobo-Dioulasso' }).expect(201);
    const refused = await ctx.http().post('/api/v1/billing/plan').set(bearer(owner)).send({ planCode: 'SALON', cycle: 'MONTHLY' }).expect(409);
    expect(refused.body.message).toContain('limitée à 1 salon');
  });

  it('offre inférieure : programmée pour le renouvellement', async () => {
    const owner = await activeTenant();
    const res = await ctx.http().post('/api/v1/billing/plan').set(bearer(owner)).send({ planCode: 'SOLO', cycle: 'MONTHLY' }).expect(201);
    expect(res.body.applied).toBe('at_renewal');
    const status = await ctx.http().get('/api/v1/billing/status').set(bearer(owner)).expect(200);
    expect(status.body).toMatchObject({ plan: { code: 'SALON' }, pendingPlan: { code: 'SOLO' } });
  });

  it('résiliation en fin de période, reprise possible ; une fois résilié, réabonnement', async () => {
    const owner = await activeTenant();
    await ctx.http().post('/api/v1/billing/cancel').set(bearer(owner)).expect(204);
    await ctx.http().post('/api/v1/billing/resume').set(bearer(owner)).expect(204);
    await ctx.http().post('/api/v1/billing/resume').set(bearer(owner)).expect(409);
    await ctx.http().post('/api/v1/billing/cancel').set(bearer(owner)).expect(204);

    await setPeriodEnd(owner.tenantId, new Date(Date.now() - 60_000), false);
    await run();
    const tenant = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
    expect(tenant.status).toBe('CANCELLED');
    const blocked = await ctx.http().post('/api/v1/clients').set(bearer(owner)).send({ fullName: 'Fatou Sawadogo', phone: uniquePhone() }).expect(403);
    expect(blocked.body.message).toContain('résilié');

    const again = await ctx.http().post('/api/v1/billing/plan').set(bearer(owner)).send({ planCode: 'SALON', cycle: 'MONTHLY' }).expect(201);
    expect(again.body.applied).toBe('on_payment');
    await payOnline(owner, again.body.invoiceId);
    expect((await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } })).status).toBe('ACTIVE');
    await ctx.http().post('/api/v1/clients').set(bearer(owner)).send({ fullName: 'Fatou Sawadogo', phone: uniquePhone() }).expect(201);
  });

  // ------------------------------------------------------------------ notifications, isolation

  it('notifications : non lues, lecture unitaire et globale, propres au membre', async () => {
    const owner = await signupOwner(ctx);
    await setPeriodEnd(owner.tenantId, new Date(Date.now() + 2 * DAY));
    await run();
    const count = await ctx.http().get('/api/v1/notifications/unread-count').set(bearer(owner)).expect(200);
    expect(count.body.count).toBeGreaterThanOrEqual(2);
    const [first] = (await ctx.http().get('/api/v1/notifications?unread=true').set(bearer(owner)).expect(200)).body;
    await ctx.http().post(`/api/v1/notifications/${first.id}/read`).set(bearer(owner)).expect(204);
    const after = await ctx.http().get('/api/v1/notifications/unread-count').set(bearer(owner)).expect(200);
    expect(after.body.count).toBe(count.body.count - 1);
    await ctx.http().post('/api/v1/notifications/read-all').set(bearer(owner)).expect(204);
    expect((await ctx.http().get('/api/v1/notifications/unread-count').set(bearer(owner)).expect(200)).body.count).toBe(0);

    const stranger = await signupOwner(ctx);
    await ctx.http().post(`/api/v1/notifications/${first.id}/read`).set(bearer(stranger)).expect(204);
    expect((await ctx.http().get('/api/v1/notifications').set(bearer(stranger)).expect(200)).body.map((n: { id: string }) => n.id)).not.toContain(first.id);
  });

  it("un salon ne voit ni ne paie les factures d'un autre", async () => {
    const a = await signupOwner(ctx);
    const b = await signupOwner(ctx);
    await setPeriodEnd(a.tenantId, new Date(Date.now() + 2 * DAY));
    await run();
    const [invoice] = await openInvoices(a.tenantId);
    await ctx.http().get(`/api/v1/billing/invoices/${invoice.id}`).set(bearer(b)).expect(404);
    await ctx.http().post(`/api/v1/billing/invoices/${invoice.id}/pay`).set(bearer(b)).send({ method: 'MOBILE_MONEY_MANUAL', reference: 'VOL-12345' }).expect(404);
    const started = await ctx.http().post(`/api/v1/billing/invoices/${invoice.id}/pay`).set(bearer(a)).send({ method: 'ONLINE' }).expect(201);
    await ctx.http().get(`/api/v1/billing/payments/${started.body.paymentId}`).set(bearer(b)).expect(404);
    const token = new URL(started.body.checkoutUrl).searchParams.get('transaction');
    await ctx.http().post(`/api/v1/billing/sandbox/${token}/complete`).set(bearer(b)).send({ outcome: 'SUCCEEDED' }).expect(403);
    expect((await ctx.http().get('/api/v1/billing/invoices').set(bearer(b)).expect(200)).body).toHaveLength(0);
  });

  it("un membre sans « billing.manage » voit le bandeau mais pas la facturation", async () => {
    const owner = await signupOwner(ctx);
    const member = await inviteAndAccept(ctx, owner, 'STYLIST', { allSalons: true, salonIds: [] });
    const status = await ctx.http().get('/api/v1/billing/status').set(bearer(member)).expect(200);
    expect(status.body.canManage).toBe(false);
    await ctx.http().get('/api/v1/billing').set(bearer(member)).expect(403);
    await ctx.http().get('/api/v1/billing/invoices').set(bearer(member)).expect(403);
  });

  // ------------------------------------------------------------------ super administrateur

  describe('console super administrateur', () => {
    it('réservée à l’équipe plateforme, avec des droits par rôle', async () => {
      const owner = await signupOwner(ctx);
      await ctx.http().get('/api/v1/platform/home').set(bearer(owner)).expect(403);
      const me = await ctx.http().get('/api/v1/auth/me').set(bearer(owner)).expect(200);
      expect(me.body.platformRole).toBeNull();

      const support = await platformStaff('PLATFORM_SUPPORT');
      expect((await ctx.http().get('/api/v1/auth/me').set(bearer(support)).expect(200)).body.platformRole).toBe('PLATFORM_SUPPORT');
      await ctx.http().get('/api/v1/platform/users').set(bearer(support)).expect(200);
      await ctx.http().get('/api/v1/platform/support/tickets').set(bearer(support)).expect(200);
      await ctx.http().get('/api/v1/platform/revenue').set(bearer(support)).expect(403);
      await ctx.http().get('/api/v1/platform/payments').set(bearer(support)).expect(403);
      await ctx.http().patch('/api/v1/platform/settings').set(bearer(support)).send({ graceDays: 5 }).expect(403);

      const billing = await platformStaff('PLATFORM_BILLING');
      await ctx.http().get('/api/v1/platform/revenue').set(bearer(billing)).expect(200);
      await ctx.http().get('/api/v1/platform/users').set(bearer(billing)).expect(403);

      // Un retrait prend effet immédiatement, sans attendre l'expiration du jeton.
      await ctx.admin.platformStaff.update({ where: { userId: billing.userId }, data: { isActive: false } });
      await ctx.http().get('/api/v1/platform/revenue').set(bearer(billing)).expect(403);
    });

    it('accueil, salons, abonnements, revenus et statistiques', async () => {
      const root = await platformStaff('PLATFORM_OWNER');
      const customer = await activeTenant();
      const home = await ctx.http().get('/api/v1/platform/home').set(bearer(root)).expect(200);
      expect(Number(home.body.mrr)).toBeGreaterThan(0);
      expect(home.body.monthly).toHaveLength(12);

      const tenants = await ctx.http().get('/api/v1/platform/tenants?status=ACTIVE').set(bearer(root)).expect(200);
      const row = tenants.body.find((t: { id: string }) => t.id === customer.tenantId);
      expect(row).toMatchObject({ status: 'ACTIVE', salonsCount: 1, owner: { phone: customer.phone } });
      const byPhone = await ctx.http().get(`/api/v1/platform/tenants?search=${encodeURIComponent(customer.phone)}`).set(bearer(root)).expect(200);
      expect(byPhone.body.map((t: { id: string }) => t.id)).toEqual([customer.tenantId]);

      const detail = await ctx.http().get(`/api/v1/platform/tenants/${customer.tenantId}`).set(bearer(root)).expect(200);
      expect(detail.body.subscription.status).toBe('ACTIVE');
      expect(detail.body.invoices[0].status).toBe('PAID');
      expect(detail.body.activity).toMatchObject({ staff: 1 });
      expect(detail.body.members[0].roles).toContain('Propriétaire');

      const subs = await ctx.http().get('/api/v1/platform/subscriptions?status=ACTIVE').set(bearer(root)).expect(200);
      expect(subs.body.items.some((s: { tenant: { id: string } }) => s.tenant.id === customer.tenantId)).toBe(true);

      const revenue = await ctx.http().get('/api/v1/platform/revenue').set(bearer(root)).expect(200);
      expect(Number(revenue.body.arr)).toBe(Number(revenue.body.mrr) * 12);
      expect(revenue.body.byPlan.length).toBeGreaterThan(0);
      expect(Number(revenue.body.collectedThisMonth)).toBeGreaterThan(0);

      const stats = await ctx.http().get('/api/v1/platform/statistics').set(bearer(root)).expect(200);
      expect(stats.body.tenants.total).toBeGreaterThan(1);
      expect(stats.body.tenants.signupsMonthly).toHaveLength(12);
    });

    it('gestes commerciaux : prolonger un essai, suspendre et réactiver un salon', async () => {
      const root = await platformStaff('PLATFORM_OWNER');
      const owner = await signupOwner(ctx);
      const before = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: owner.tenantId } });
      const extended = await ctx.http().post(`/api/v1/platform/tenants/${owner.tenantId}/extend-trial`).set(bearer(root)).send({ days: 15 }).expect(201);
      expect(new Date(extended.body.trialEndsAt).getTime() - before.trialEndsAt!.getTime()).toBe(15 * DAY);

      await ctx.http().post(`/api/v1/platform/tenants/${owner.tenantId}/suspend`).set(bearer(root)).send({ reason: 'Usage frauduleux signalé' }).expect(204);
      await ctx.http().post('/api/v1/clients').set(bearer(owner)).send({ fullName: 'Test Test', phone: uniquePhone() }).expect(403);
      const reactivated = await ctx.http().post(`/api/v1/platform/tenants/${owner.tenantId}/reactivate`).set(bearer(root)).expect(201);
      expect(reactivated.body.status).toBe('TRIAL');
      await ctx.http().post('/api/v1/clients').set(bearer(owner)).send({ fullName: 'Test Test', phone: uniquePhone() }).expect(201);
      const actions = (await ctx.admin.auditLog.findMany({ where: { tenantId: owner.tenantId, action: { startsWith: 'platform.' } } })).map((a) => a.action);
      expect(actions).toEqual(expect.arrayContaining(['platform.trial_extended', 'platform.tenant_suspended', 'platform.tenant_reactivated']));
    });

    it('utilisateurs : désactivation avec déconnexion immédiate, réactivation, équipe', async () => {
      const root = await platformStaff('PLATFORM_OWNER');
      const owner = await signupOwner(ctx);
      const user = await ctx.admin.user.findUniqueOrThrow({ where: { phone: owner.phone } });
      const found = await ctx.http().get(`/api/v1/platform/users?search=${encodeURIComponent(owner.phone)}`).set(bearer(root)).expect(200);
      expect(found.body[0]).toMatchObject({ id: user.id, tenants: [{ roles: ['Propriétaire'] }] });

      await ctx.http().post(`/api/v1/platform/users/${user.id}/status`).set(bearer(root)).send({ status: 'DISABLED', reason: 'Demande du titulaire' }).expect(204);
      await ctx.http().get('/api/v1/billing/status').set(bearer(owner)).expect(401);
      await refresh(ctx, owner.cookie).expect(401);
      await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: owner.password }).expect(401);
      await ctx.http().post(`/api/v1/platform/users/${user.id}/status`).set(bearer(root)).send({ status: 'ACTIVE', reason: 'Identité vérifiée' }).expect(204);
      await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: owner.password }).expect(200);

      // On ne peut pas se désactiver soi-même, ni retirer le dernier super administrateur.
      await ctx.http().post(`/api/v1/platform/users/${root.userId}/status`).set(bearer(root)).send({ status: 'DISABLED', reason: 'test' }).expect(400);
      const granted = await ctx.http().post('/api/v1/platform/staff').set(bearer(root)).send({ phone: owner.phone, role: 'PLATFORM_SUPPORT' }).expect(201);
      expect(granted.body.role).toBe('PLATFORM_SUPPORT');
      await ctx.http().post(`/api/v1/platform/staff/${user.id}/revoke`).set(bearer(root)).expect(204);
      await ctx.http().post(`/api/v1/platform/staff/${root.userId}/revoke`).set(bearer(root)).expect(400);
    });

    it('support : ticket du salon, réponse publique, note interne invisible du salon', async () => {
      const root = await platformStaff('PLATFORM_OWNER');
      const owner = await signupOwner(ctx);
      const ticket = await ctx
        .http()
        .post('/api/v1/support/tickets')
        .set(bearer(owner))
        .send({ subject: 'Facture introuvable', category: 'billing', body: 'Je ne retrouve pas ma facture de septembre.' })
        .expect(201);
      expect(ticket.body).toMatchObject({ number: 1, status: 'OPEN' });

      const queue = await ctx.http().get('/api/v1/platform/support/tickets').set(bearer(root)).expect(200);
      const item = queue.body.items.find((t: { id: string }) => t.id === ticket.body.id);
      expect(item).toMatchObject({ priority: 'HIGH', tenant: { id: owner.tenantId } });

      await ctx.http().post(`/api/v1/platform/support/tickets/${ticket.body.id}/messages`).set(bearer(root)).send({ body: 'Client fiable, geste possible.', internal: true }).expect(204);
      await ctx.http().post(`/api/v1/platform/support/tickets/${ticket.body.id}/messages`).set(bearer(root)).send({ body: 'Elle est dans Abonnement → Factures.' }).expect(204);

      const seen = await ctx.http().get(`/api/v1/support/tickets/${ticket.body.id}`).set(bearer(owner)).expect(200);
      expect(seen.body.status).toBe('PENDING');
      expect(seen.body.messages.map((m: { body: string }) => m.body)).toEqual(['Je ne retrouve pas ma facture de septembre.', 'Elle est dans Abonnement → Factures.']);
      expect(seen.body.messages[1].authorName).toBe('Équipe support');
      // Même en lisant la table directement avec la connexion de l'API, la note interne reste invisible.
      const api = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
      try {
        const rows = await api.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${owner.tenantId}, true)`;
          return tx.$queryRaw<{ internal: boolean }[]>`SELECT internal FROM support_messages WHERE ticket_id = ${ticket.body.id}::uuid`;
        });
        expect(rows).toHaveLength(2);
        expect(rows.every((r) => !r.internal)).toBe(true);
      } finally {
        await api.$disconnect();
      }
      const notifications = await ctx.http().get('/api/v1/notifications').set(bearer(owner)).expect(200);
      expect(notifications.body[0]).toMatchObject({ event: 'support.reply', actionUrl: `/support/${ticket.body.id}` });

      await ctx.http().post(`/api/v1/support/tickets/${ticket.body.id}/messages`).set(bearer(owner)).send({ body: 'Merci, trouvée !' }).expect(204);
      const full = await ctx.http().get(`/api/v1/platform/support/tickets/${ticket.body.id}`).set(bearer(root)).expect(200);
      expect(full.body.status).toBe('OPEN');
      expect(full.body.messages).toHaveLength(4);
      expect(full.body.messages.filter((m: { internal: boolean }) => m.internal)).toHaveLength(1);
      await ctx.http().patch(`/api/v1/platform/support/tickets/${ticket.body.id}`).set(bearer(root)).send({ status: 'RESOLVED' }).expect(204);

      const stranger = await signupOwner(ctx);
      await ctx.http().get(`/api/v1/support/tickets/${ticket.body.id}`).set(bearer(stranger)).expect(404);
    });

    it('paramètres et offres : modifiés par le super administrateur, appliqués aux salons', async () => {
      const root = await platformStaff('PLATFORM_OWNER');
      const settings = await ctx.http().get('/api/v1/platform/settings').set(bearer(root)).expect(200);
      expect(settings.body.technical.paymentProvider).toBe('sandbox');

      const mobileMoney = [
        { operator: 'Orange Money', number: '+22670000000' },
        { operator: 'Moov Money', number: '+22660000000' },
      ];
      await ctx.http().patch('/api/v1/platform/settings').set(bearer(root)).send({ mobileMoney, legalName: 'Salons SaaS SARL' }).expect(200);
      await ctx.http().patch('/api/v1/platform/settings').set(bearer(root)).send({ graceDays: 99 }).expect(400);
      ctx.app.get(PlatformSettingsService)['cache'] = null;
      const owner = await signupOwner(ctx);
      const overview = await ctx.http().get('/api/v1/billing').set(bearer(owner)).expect(200);
      expect(overview.body.paymentOptions.mobileMoney).toEqual(mobileMoney);

      const plans = await ctx.http().get('/api/v1/platform/plans').set(bearer(root)).expect(200);
      const solo = plans.body.find((p: { code: string }) => p.code === 'SOLO');
      const body = {
        code: solo.code,
        name: solo.name,
        description: solo.description ?? '',
        priceMonthly: solo.priceMonthly,
        priceYearly: solo.priceYearly,
        maxSalons: solo.maxSalons,
        maxStaff: solo.maxStaff,
        smsQuotaMonthly: solo.smsQuotaMonthly,
        features: solo.features,
        isPublic: solo.isPublic,
        isActive: solo.isActive,
        sortOrder: solo.sortOrder,
      };
      await ctx.http().put(`/api/v1/platform/plans/${solo.id}`).set(bearer(root)).send({ ...body, priceMonthly: 6_000, priceYearly: 60_000 }).expect(200);
      const after = await ctx.http().get('/api/v1/billing').set(bearer(owner)).expect(200);
      expect(after.body.plans.find((p: { code: string }) => p.code === 'SOLO').priceMonthly).toBe(6_000);
      // Remise en état pour les autres tests.
      await ctx.http().put(`/api/v1/platform/plans/${solo.id}`).set(bearer(root)).send(body).expect(200);
      await ctx.admin.platformSetting.deleteMany();
      ctx.app.get(PlatformSettingsService)['cache'] = null;
    });
  });
});
