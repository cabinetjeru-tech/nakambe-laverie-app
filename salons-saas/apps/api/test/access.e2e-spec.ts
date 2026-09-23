import { bearer, createTestContext, inviteAndAccept, refresh, signupOwner, TestContext } from './helpers';

describe('Rôles et permissions', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function roleId(account: { accessToken: string }, code: string): Promise<string> {
    const roles = await ctx.http().get('/api/v1/roles').set(bearer(account)).expect(200);
    return roles.body.find((r: { code: string }) => r.code === code).id;
  }

  /** Entreprise sur l'offre Multi-salons avec deux salons. */
  async function multiSalonTenant() {
    const owner = await signupOwner(ctx);
    const multi = await ctx.admin.plan.findUniqueOrThrow({ where: { code: 'MULTI' } });
    await ctx.admin.tenant.update({ where: { id: owner.tenantId }, data: { planId: multi.id } });
    const [salon1] = (await ctx.http().get('/api/v1/salons').set(bearer(owner)).expect(200)).body;
    const salon2 = (await ctx.http().post('/api/v1/salons').set(bearer(owner)).send({ name: 'Annexe Gounghin', city: 'Ouagadougou' }).expect(201)).body;
    return { owner, salon1: salon1.id as string, salon2: salon2.id as string };
  }

  it('toute route exige une permission précise : un coiffeur ne gère ni les salons ni les rôles', async () => {
    const owner = await signupOwner(ctx);
    const stylist = await inviteAndAccept(ctx, owner, 'STYLIST', { allSalons: true, salonIds: [] });
    expect(stylist.permissions).toEqual(expect.arrayContaining(['appointments.read.own', 'commissions.read.own']));
    expect(stylist.permissions).not.toContain('sales.void');

    const [salon] = (await ctx.http().get('/api/v1/salons').set(bearer(stylist)).expect(200)).body;
    await ctx.http().patch(`/api/v1/salons/${salon.id}`).set(bearer(stylist)).send({ name: 'Nouveau nom' }).expect(403);
    await ctx.http().post('/api/v1/roles').set(bearer(stylist)).send({ name: 'Moi', permissions: [] }).expect(403);
    await ctx.http().get('/api/v1/permissions').set(bearer(stylist)).expect(403);
    await ctx.http().get('/api/v1/members').set(bearer(stylist)).expect(200);
  });

  it("l'offre limite les permissions et les rôles personnalisés", async () => {
    const owner = await signupOwner(ctx);
    const solo = await ctx.admin.plan.findUniqueOrThrow({ where: { code: 'SOLO' } });
    await ctx.admin.tenant.update({ where: { id: owner.tenantId }, data: { planId: solo.id } });
    const session = await refresh(ctx, owner.cookie).expect(200);
    expect(session.body.activeTenant.permissions).not.toContain('stock.read');
    expect(session.body.activeTenant.permissions).toContain('appointments.read');

    await ctx.http().post('/api/v1/roles').set(bearer(session.body)).send({ name: 'Chef', permissions: ['staff.read'] }).expect(403);
    const catalog = await ctx.http().get('/api/v1/permissions').set(bearer(session.body)).expect(200);
    expect(catalog.body.find((p: { code: string }) => p.code === 'stock.read').availableInPlan).toBe(false);
  });

  it("le rôle Propriétaire n'est pas modifiable ; les autres rôles système le sont", async () => {
    const owner = await signupOwner(ctx);
    await ctx.http().patch(`/api/v1/roles/${await roleId(owner, 'OWNER')}`).set(bearer(owner)).send({ permissions: [] }).expect(403);
    const updated = await ctx
      .http()
      .patch(`/api/v1/roles/${await roleId(owner, 'STYLIST')}`)
      .set(bearer(owner))
      .send({ permissions: ['salons.read', 'appointments.read.own', 'sales.create'] })
      .expect(200);
    expect(updated.body.permissions).toEqual(['appointments.read.own', 'sales.create', 'salons.read']);
    await ctx.http().delete(`/api/v1/roles/${await roleId(owner, 'STYLIST')}`).set(bearer(owner)).expect(403);
  });

  it('un changement de droits prend effet immédiatement', async () => {
    const owner = await signupOwner(ctx);
    const member = await inviteAndAccept(ctx, owner, 'STYLIST', { allSalons: true, salonIds: [] });
    const receptionist = await roleId(owner, 'RECEPTIONIST');
    await ctx
      .http()
      .put(`/api/v1/members/${member.membershipId}/access`)
      .set(bearer(owner))
      .send({ roleIds: [receptionist], allSalons: true, salonIds: [] })
      .expect(200);

    // L'ancien jeton (droits de coiffeur) est refusé ; le refresh donne les nouveaux droits.
    await ctx.http().get('/api/v1/salons').set(bearer(member)).expect(401);
    const renewed = await refresh(ctx, member.cookie).expect(200);
    expect(renewed.body.activeTenant.permissions).toContain('sales.create');

    // Modifier un rôle invalide aussi les jetons de ceux qui le portent.
    await ctx
      .http()
      .patch(`/api/v1/roles/${await roleId(owner, 'RECEPTIONIST')}`)
      .set(bearer(owner))
      .send({ permissions: ['salons.read'] })
      .expect(200);
    await ctx.http().get('/api/v1/salons').set(bearer(renewed.body)).expect(401);
  });

  it("un membre suspendu perd l'accès à l'entreprise mais garde son compte", async () => {
    const owner = await signupOwner(ctx);
    const member = await inviteAndAccept(ctx, owner, 'RECEPTIONIST', { allSalons: true, salonIds: [] });
    await ctx.http().post(`/api/v1/members/${member.membershipId}/suspend`).set(bearer(owner)).expect(200);
    await ctx.http().get('/api/v1/salons').set(bearer(member)).expect(401);
    const renewed = await refresh(ctx, member.cookie).expect(200);
    expect(renewed.body.activeTenant).toBeNull();
    await ctx.http().get('/api/v1/salons').set(bearer(renewed.body)).expect(403);

    await ctx.http().post(`/api/v1/members/${member.membershipId}/reactivate`).set(bearer(owner)).expect(200);
    const back = await ctx.http().post('/api/v1/auth/switch-tenant').set(bearer(renewed.body)).send({ tenantId: owner.tenantId }).expect(200);
    await ctx.http().get('/api/v1/salons').set(bearer(back.body)).expect(200);
  });

  describe('anti-escalade de privilèges', () => {
    it("on ne peut ni modifier ses propres accès, ni retirer le dernier propriétaire", async () => {
      const owner = await signupOwner(ctx);
      const members = await ctx.http().get('/api/v1/members').set(bearer(owner)).expect(200);
      const self = members.body[0].id;
      await ctx.http().post(`/api/v1/members/${self}/suspend`).set(bearer(owner)).expect(403);

      const second = await inviteAndAccept(ctx, owner, 'OWNER', { allSalons: true, salonIds: [] });
      const manager = await roleId(owner, 'MANAGER');
      // Le second propriétaire rétrograde le premier : autorisé, il reste un propriétaire.
      await ctx
        .http()
        .put(`/api/v1/members/${self}/access`)
        .set(bearer(second))
        .send({ roleIds: [manager], allSalons: true, salonIds: [] })
        .expect(200);
      const remaining = await ctx.admin.membership.count({
        where: { tenantId: owner.tenantId, status: 'ACTIVE', roles: { some: { role: { code: 'OWNER' } } } },
      });
      expect(remaining).toBe(1);
    });

    it("un rôle personnalisé ne peut pas accorder plus que les droits de son auteur", async () => {
      const { owner } = await multiSalonTenant();
      const lead = await ctx
        .http()
        .post('/api/v1/roles')
        .set(bearer(owner))
        .send({ name: "Chef d'équipe", permissions: ['roles.manage', 'staff.read', 'staff.manage', 'salons.read', 'appointments.read'] })
        .expect(201);
      const member = await inviteAndAccept(ctx, owner, lead.body.code, { allSalons: true, salonIds: [] });

      await ctx.http().post('/api/v1/roles').set(bearer(member)).send({ name: 'Caissier', permissions: ['sales.void'] }).expect(403);
      await ctx.http().post('/api/v1/roles').set(bearer(member)).send({ name: 'Lecteur', permissions: ['appointments.read'] }).expect(201);
      // Ni modifier un rôle plus puissant que soi, ni attribuer le rôle Propriétaire.
      const ownerRole = await roleId(owner, 'OWNER');
      const managerRole = await roleId(owner, 'MANAGER');
      await ctx.http().patch(`/api/v1/roles/${managerRole}`).set(bearer(member)).send({ name: 'Gérant bis' }).expect(403);
      await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(member))
        .send({ phone: '+22672222222', roleId: ownerRole, allSalons: true, salonIds: [] })
        .expect(403);
      await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(member))
        .send({ phone: '+22672222222', roleId: managerRole, allSalons: true, salonIds: [] })
        .expect(403);
      // Ni toucher aux accès du propriétaire.
      const members = await ctx.http().get('/api/v1/members').set(bearer(owner)).expect(200);
      const ownerMembership = members.body.find((m: { roles: { code: string }[] }) => m.roles.some((r) => r.code === 'OWNER')).id;
      await ctx
        .http()
        .put(`/api/v1/members/${ownerMembership}/access`)
        .set(bearer(member))
        .send({ roleIds: [lead.body.id], allSalons: true, salonIds: [] })
        .expect(403);
    });
  });

  describe('périmètre par salon', () => {
    it("un gérant limité à un salon ne voit et n'accorde que ce salon", async () => {
      const { owner, salon1, salon2 } = await multiSalonTenant();
      const manager = await inviteAndAccept(ctx, owner, 'MANAGER', { allSalons: false, salonIds: [salon1] });

      const salons = await ctx.http().get('/api/v1/salons').set(bearer(manager)).expect(200);
      expect(salons.body.map((s: { id: string }) => s.id)).toEqual([salon1]);
      await ctx.http().get(`/api/v1/salons/${salon2}`).set(bearer(manager)).expect(404);
      // Le gérant n'a pas salons.manage par défaut, et ne peut pas ouvrir de salon.
      await ctx.http().post('/api/v1/salons').set(bearer(manager)).send({ name: 'Pirate', city: 'Bobo' }).expect(403);

      const receptionist = await roleId(owner, 'RECEPTIONIST');
      await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(manager))
        .send({ phone: '+22673333333', roleId: receptionist, allSalons: false, salonIds: [salon2] })
        .expect(403);
      await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(manager))
        .send({ phone: '+22673333333', roleId: receptionist, allSalons: true, salonIds: [] })
        .expect(403);
      await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(manager))
        .send({ phone: '+22673333333', roleId: receptionist, allSalons: false, salonIds: [salon1] })
        .expect(201);

      // Un employé de l'autre salon est invisible pour ce gérant.
      const other = await inviteAndAccept(ctx, owner, 'STYLIST', { allSalons: false, salonIds: [salon2] });
      const visible = await ctx.http().get('/api/v1/members').set(bearer(manager)).expect(200);
      expect(visible.body.map((m: { id: string }) => m.id)).not.toContain(other.membershipId);
      await ctx.http().post(`/api/v1/members/${other.membershipId}/suspend`).set(bearer(manager)).expect(404);
    });

    it("un salon limité par l'offre ne peut pas être dépassé", async () => {
      const owner = await signupOwner(ctx);
      await ctx.http().post('/api/v1/salons').set(bearer(owner)).send({ name: 'Deuxième', city: 'Ouagadougou' }).expect(403);
    });
  });

  it("un abonnement suspendu passe l'entreprise en lecture seule", async () => {
    const owner = await signupOwner(ctx);
    await ctx.admin.tenant.update({ where: { id: owner.tenantId }, data: { status: 'SUSPENDED' } });
    const [salon] = (await ctx.http().get('/api/v1/salons').set(bearer(owner)).expect(200)).body;
    await ctx.http().patch(`/api/v1/salons/${salon.id}`).set(bearer(owner)).send({ name: 'Modifié' }).expect(403);
  });

  it("les actions sensibles sont tracées dans le journal d'audit du tenant", async () => {
    const owner = await signupOwner(ctx);
    const member = await inviteAndAccept(ctx, owner, 'STYLIST', { allSalons: true, salonIds: [] });
    await ctx.http().post(`/api/v1/members/${member.membershipId}/suspend`).set(bearer(owner)).expect(200);
    const actions = (await ctx.admin.auditLog.findMany({ where: { tenantId: owner.tenantId }, orderBy: { createdAt: 'asc' } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['tenant.signup', 'invitation.create', 'invitation.accept', 'member.suspend']));
  });
});
