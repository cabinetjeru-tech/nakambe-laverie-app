import { DbService, MissingDbContextError } from '../src/core/db/db.service';
import { TenantScopeViolation } from '../src/core/db/tenant-scope.extension';
import { bearer, createTestContext, inviteAndAccept, login, signupOwner, TestContext } from './helpers';

/**
 * Isolation stricte entre entreprises, vérifiée sur les trois couches :
 *   1. API     : le tenant vient du jeton ; une ressource d'un autre tenant répond 404 ;
 *   2. Prisma  : l'extension ajoute le filtre tenant et refuse toute requête hors contexte ;
 *   3. PostgreSQL : la RLS filtre même une requête SQL brute qui contourne l'extension.
 */
describe('Isolation des données entre entreprises', () => {
  let ctx: TestContext;
  let ownerA: Awaited<ReturnType<typeof signupOwner>>;
  let ownerB: Awaited<ReturnType<typeof signupOwner>>;
  let salonA: string;
  let salonB: string;

  beforeAll(async () => {
    ctx = await createTestContext();
    ownerA = await signupOwner(ctx, { businessName: 'Salon Alpha' });
    ownerB = await signupOwner(ctx, { businessName: 'Salon Bravo' });
    salonA = (await ctx.http().get('/api/v1/salons').set(bearer(ownerA)).expect(200)).body[0].id;
    salonB = (await ctx.http().get('/api/v1/salons').set(bearer(ownerB)).expect(200)).body[0].id;
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('couche API', () => {
    it("chaque entreprise ne voit que ses salons", async () => {
      const listA = await ctx.http().get('/api/v1/salons').set(bearer(ownerA)).expect(200);
      expect(listA.body.map((s: { id: string }) => s.id)).toEqual([salonA]);
    });

    it("un salon d'une autre entreprise est introuvable, en lecture comme en écriture", async () => {
      await ctx.http().get(`/api/v1/salons/${salonB}`).set(bearer(ownerA)).expect(404);
      await ctx.http().patch(`/api/v1/salons/${salonB}`).set(bearer(ownerA)).send({ name: 'Piraté' }).expect(404);
      const salon = await ctx.admin.salon.findUniqueOrThrow({ where: { id: salonB } });
      expect(salon.name).not.toBe('Piraté');
    });

    it("rôles, membres et invitations d'une autre entreprise sont inaccessibles", async () => {
      const rolesA = await ctx.http().get('/api/v1/roles').set(bearer(ownerA)).expect(200);
      const rolesB = await ctx.http().get('/api/v1/roles').set(bearer(ownerB)).expect(200);
      const idsA = new Set(rolesA.body.map((r: { id: string }) => r.id));
      expect(rolesB.body.some((r: { id: string }) => idsA.has(r.id))).toBe(false);

      const stylistRoleB = rolesB.body.find((r: { code: string }) => r.code === 'STYLIST').id;
      await ctx.http().patch(`/api/v1/roles/${stylistRoleB}`).set(bearer(ownerA)).send({ name: 'Piraté' }).expect(404);
      await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(ownerA))
        .send({ phone: '+22670000000', roleId: stylistRoleB, allSalons: true, salonIds: [] })
        .expect(400);
      await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(ownerA))
        .send({ phone: '+22670000000', roleId: rolesA.body.find((r: { code: string }) => r.code === 'STYLIST').id, allSalons: false, salonIds: [salonB] })
        .expect(400);

      const membersB = await ctx.http().get('/api/v1/members').set(bearer(ownerB)).expect(200);
      await ctx
        .http()
        .put(`/api/v1/members/${membersB.body[0].id}/access`)
        .set(bearer(ownerA))
        .send({ roleIds: [stylistRoleB], allSalons: true, salonIds: [] })
        .expect(404);
      await ctx.http().post(`/api/v1/members/${membersB.body[0].id}/suspend`).set(bearer(ownerA)).expect(404);
    });

    it("un membre de deux entreprises change d'entreprise ; il ne peut pas choisir une entreprise dont il n'est pas membre", async () => {
      const member = await inviteAndAccept(ctx, ownerA, 'RECEPTIONIST', { allSalons: true, salonIds: [] });
      // Invitation dans B pour le même numéro : compte existant, mot de passe actuel requis.
      const rolesB = await ctx.http().get('/api/v1/roles').set(bearer(ownerB)).expect(200);
      const invitation = await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(ownerB))
        .send({ phone: member.phone, roleId: rolesB.body.find((r: { code: string }) => r.code === 'STYLIST').id, allSalons: true, salonIds: [] })
        .expect(201);
      const token = invitation.body.link.split('#')[1];
      await ctx.http().post('/api/v1/auth/invitations/accept').send({ token, password: 'mauvais-mot-de-passe' }).expect(401);
      await ctx.http().post('/api/v1/auth/invitations/accept').send({ token, password: member.password }).expect(201);

      // Deux entreprises : aucune n'est sélectionnée d'office à la connexion.
      const session = await login(ctx, member.phone, member.password);
      expect(session.tenantId).toBeNull();
      const me = await ctx.http().get('/api/v1/auth/me').set(bearer(session)).expect(200);
      expect(me.body.memberships.map((m: { tenantId: string }) => m.tenantId).sort()).toEqual([ownerA.tenantId, ownerB.tenantId].sort());

      const inB = await ctx.http().post('/api/v1/auth/switch-tenant').set(bearer(session)).send({ tenantId: ownerB.tenantId }).expect(200);
      expect(inB.body.activeTenant.permissions).not.toContain('sales.create'); // coiffeur chez B
      const salons = await ctx.http().get('/api/v1/salons').set(bearer(inB.body)).expect(200);
      expect(salons.body.map((s: { id: string }) => s.id)).toEqual([salonB]);

      const inA = await ctx.http().post('/api/v1/auth/switch-tenant').set(bearer(session)).send({ tenantId: ownerA.tenantId }).expect(200);
      expect(inA.body.activeTenant.permissions).toContain('sales.create'); // réceptionniste chez A

      const stranger = await signupOwner(ctx, { businessName: 'Salon Charlie' });
      await ctx.http().post('/api/v1/auth/switch-tenant').set(bearer(session)).send({ tenantId: stranger.tenantId }).expect(404);
    });

    it("une invitation d'une entreprise ne donne pas accès à une autre, même en modifiant le jeton", async () => {
      const rolesA = await ctx.http().get('/api/v1/roles').set(bearer(ownerA)).expect(200);
      const invitation = await ctx
        .http()
        .post('/api/v1/invitations')
        .set(bearer(ownerA))
        .send({ phone: '+22671111111', roleId: rolesA.body.find((r: { code: string }) => r.code === 'STYLIST').id, allSalons: true, salonIds: [] })
        .expect(201);
      const [, secret] = invitation.body.link.split('#')[1].split('.');
      await ctx
        .http()
        .post('/api/v1/auth/invitations/accept')
        .send({ token: `${ownerB.tenantId}.${secret}`, fullName: 'Intrus', password: 'mot-de-passe-intrus' })
        .expect(400);
    });
  });

  describe('couches Prisma et PostgreSQL', () => {
    let db: DbService;

    beforeAll(() => {
      db = ctx.app.get(DbService);
    });

    it('refuse tout accès à la base hors contexte', () => {
      expect(() => db.tx).toThrow(MissingDbContextError);
    });

    it('refuse une requête sur une table tenant sans tenant courant', async () => {
      await expect(db.withContext({}, () => db.tx.salon.findMany())).rejects.toThrow(TenantScopeViolation);
    });

    it('refuse de filtrer ou de créer explicitement dans un autre tenant', async () => {
      await expect(
        db.withContext({ tenantId: ownerA.tenantId }, () => db.tx.salon.findMany({ where: { tenantId: ownerB.tenantId } })),
      ).rejects.toThrow(TenantScopeViolation);
      await expect(
        db.withContext({ tenantId: ownerA.tenantId }, () =>
          db.tx.serviceCategory.create({ data: { tenantId: ownerB.tenantId, name: 'Intrusion' } }),
        ),
      ).rejects.toThrow(TenantScopeViolation);
    });

    it('ajoute le filtre tenant même à une recherche par identifiant', async () => {
      const found = await db.withContext({ tenantId: ownerA.tenantId }, () => db.tx.salon.findUnique({ where: { id: salonB } }));
      expect(found).toBeNull();
    });

    it("la RLS filtre une requête SQL brute qui contourne l'extension", async () => {
      const rows = await db.withContext({ tenantId: ownerA.tenantId }, () =>
        db.tx.$queryRaw<{ tenant_id: string }[]>`SELECT tenant_id::text FROM salons`,
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tenant_id === ownerA.tenantId)).toBe(true);

      const none = await db.withContext({}, () => db.tx.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM salons`);
      expect(Number(none[0].n)).toBe(0);
    });

    it("la RLS refuse une écriture SQL brute dans un autre tenant", async () => {
      await expect(
        db.withContext({ tenantId: ownerA.tenantId }, () =>
          db.tx.$executeRaw`UPDATE salons SET name = 'Piraté' WHERE id = ${salonB}::uuid`,
        ),
      ).resolves.toBe(0);
      await expect(
        db.withContext({ tenantId: ownerA.tenantId }, () =>
          db.tx.$executeRaw`INSERT INTO service_categories (id, tenant_id, name) VALUES (gen_random_uuid(), ${ownerB.tenantId}::uuid, 'Intrusion')`,
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it('le contexte ne fuit pas entre deux transactions de la même connexion', async () => {
      await db.withContext({ tenantId: ownerA.tenantId }, async () => undefined);
      const setting = await db.withContext({}, () =>
        db.tx.$queryRaw<{ value: string | null }[]>`SELECT current_setting('app.tenant_id', true) AS value`,
      );
      expect(setting[0].value ?? '').toBe('');
    });
  });
});
