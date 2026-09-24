import { JwtService } from '@nestjs/jwt';
import { bearer, createTestContext, login, refresh, refreshCookie, signupOwner, TestContext, uniquePhone } from './helpers';

describe('Authentification', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestContext();
  });

  afterAll(async () => {
    await ctx.close();
  });

  describe('inscription', () => {
    it("crée l'entreprise, le premier salon et connecte le propriétaire", async () => {
      const phone = uniquePhone();
      const res = await ctx
        .http()
        .post('/api/v1/auth/signup')
        .send({ fullName: 'Awa Traoré', phone, password: 'motdepasse-1', businessName: 'Beauté Divine', salonName: 'Centre', city: 'Ouagadougou' })
        .expect(201);

      expect(res.body.accessToken).toEqual(expect.any(String));
      expect(res.body).not.toHaveProperty('refreshToken');
      expect(res.body.activeTenant.salons).toBe('*');
      expect(res.body.activeTenant.permissions).toEqual(expect.arrayContaining(['roles.manage', 'salons.manage', 'billing.manage']));
      // Offre SALON : pas de marketing ni de rôles personnalisés.
      expect(res.body.activeTenant.permissions).not.toContain('campaigns.send');

      const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('salons_rt='))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

      const tenantId = res.body.activeTenant.tenantId;
      const tenant = await ctx.admin.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { salons: true, roles: true } });
      expect(tenant.status).toBe('TRIAL');
      expect(tenant.salons).toHaveLength(1);
      expect(tenant.roles.map((r) => r.code).sort()).toEqual(['ACCOUNTANT', 'MANAGER', 'OWNER', 'RECEPTIONIST', 'STYLIST']);
      const user = await ctx.admin.user.findUniqueOrThrow({ where: { phone } });
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    });

    it('refuse un numéro déjà inscrit', async () => {
      const owner = await signupOwner(ctx);
      await ctx
        .http()
        .post('/api/v1/auth/signup')
        .send({ fullName: 'Autre', phone: owner.phone, password: 'motdepasse-2', businessName: 'Autre salon', salonName: 'Centre', city: 'Ouaga' })
        .expect(409);
    });

    it('valide les données (mot de passe trop court, champ inconnu)', async () => {
      const base = { fullName: 'Awa', phone: uniquePhone(), businessName: 'B', salonName: 'Salon', city: 'Ouaga' };
      await ctx.http().post('/api/v1/auth/signup').send({ ...base, password: 'court' }).expect(400);
      await ctx.http().post('/api/v1/auth/signup').send({ ...base, businessName: 'Beauté', password: 'motdepasse-1', isAdmin: true }).expect(400);
    });

    it("inscrit un client final sans entreprise : aucune fonction de salon n'est accessible", async () => {
      const res = await ctx
        .http()
        .post('/api/v1/auth/register')
        .send({ fullName: 'Client', phone: uniquePhone(), password: 'motdepasse-client' })
        .expect(201);
      expect(res.body.activeTenant).toBeNull();
      await ctx.http().get('/api/v1/salons').set(bearer(res.body)).expect(403);
      const me = await ctx.http().get('/api/v1/auth/me').set(bearer(res.body)).expect(200);
      expect(me.body.memberships).toEqual([]);
    });
  });

  describe('connexion', () => {
    it('accepte le numéro sous forme locale et sélectionne la seule entreprise', async () => {
      const owner = await signupOwner(ctx);
      const local = owner.phone.slice(4).replace(/(\d{2})(?=\d)/g, '$1 '); // « 70 12 34 56 »
      const session = await login(ctx, local, owner.password);
      expect(session.tenantId).toBe(owner.tenantId);
    });

    it("renvoie la même erreur pour un compte inconnu et un mauvais mot de passe", async () => {
      const owner = await signupOwner(ctx);
      const wrong = await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: 'faux-mot-de-passe' }).expect(401);
      const unknown = await ctx.http().post('/api/v1/auth/login').send({ identifier: uniquePhone(), password: 'faux-mot-de-passe' }).expect(401);
      expect(wrong.body.message).toBe(unknown.body.message);
    });

    it('verrouille le compte après 5 échecs, même avec le bon mot de passe ensuite', async () => {
      const owner = await signupOwner(ctx);
      for (let i = 0; i < 4; i++) {
        await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: 'mauvais' }).expect(401);
      }
      const locked = await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: 'mauvais' }).expect(429);
      expect(locked.body.retryAfterSeconds).toBeGreaterThan(0);
      await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: owner.password }).expect(429);
    });

    it('refuse un jeton signé avec une autre clé ou falsifié', async () => {
      const owner = await signupOwner(ctx);
      const forged = new JwtService().sign(
        { sub: 'x', sid: 'y', tid: owner.tenantId, mid: 'z', perms: ['salons.read'], sal: '*', pv: 1 },
        { secret: 'une-autre-cle-secrete-de-plus-de-32-caracteres', issuer: 'salons-saas', audience: 'salons-saas-api' },
      );
      await ctx.http().get('/api/v1/salons').set('Authorization', `Bearer ${forged}`).expect(401);
      const [header, , signature] = owner.accessToken.split('.');
      const payload = Buffer.from(JSON.stringify({ sub: 'x', perms: ['salons.manage'] })).toString('base64url');
      await ctx.http().get('/api/v1/salons').set('Authorization', `Bearer ${header}.${payload}.${signature}`).expect(401);
      await ctx.http().get('/api/v1/salons').expect(401);
    });
  });

  describe('session et refresh token', () => {
    it("exige l'en-tête anti-CSRF", async () => {
      const owner = await signupOwner(ctx);
      await ctx.http().post('/api/v1/auth/refresh').set('Cookie', owner.cookie).expect(403);
    });

    it('fait tourner le refresh token à chaque usage', async () => {
      const owner = await signupOwner(ctx);
      const first = await refresh(ctx, owner.cookie).expect(200);
      const nextCookie = refreshCookie(first);
      expect(nextCookie).not.toBe(owner.cookie);
      expect(first.body.activeTenant.tenantId).toBe(owner.tenantId);
      await ctx.http().get('/api/v1/salons').set(bearer(first.body)).expect(200);
    });

    it('renouvelle la session même si le navigateur joint un jeton d’accès périmé (droits modifiés)', async () => {
      const owner = await signupOwner(ctx);
      await ctx.admin.membership.updateMany({ where: { user: { phone: owner.phone } }, data: { permissionsVersion: { increment: 1 } } });
      await ctx.http().get('/api/v1/salons').set(bearer(owner)).expect(401);
      const renewed = await refresh(ctx, owner.cookie).set(bearer(owner)).expect(200);
      await ctx.http().get('/api/v1/salons').set(bearer(renewed.body)).expect(200);
    });

    it("révoque toute la session si un ancien refresh token est réutilisé (vol probable)", async () => {
      const owner = await signupOwner(ctx);
      const rotated = await refresh(ctx, owner.cookie).expect(200);
      // Au-delà du délai de grâce entre onglets :
      await ctx.admin.userSession.updateMany({
        where: { rotatedAt: { not: null }, user: { phone: owner.phone } },
        data: { rotatedAt: new Date(Date.now() - 60_000) },
      });
      await refresh(ctx, owner.cookie).expect(401);
      // Le jeton légitime le plus récent est lui aussi révoqué, ainsi que le jeton d'accès.
      await refresh(ctx, refreshCookie(rotated)).expect(401);
      await ctx.http().get('/api/v1/salons').set(bearer(rotated.body)).expect(401);
      const audit = await ctx.admin.auditLog.findFirst({ where: { action: 'auth.refresh_token_reuse' } });
      expect(audit).not.toBeNull();
    });

    it("ne révoque pas la session si deux onglets rafraîchissent en même temps", async () => {
      const owner = await signupOwner(ctx);
      const rotated = await refresh(ctx, owner.cookie).expect(200);
      await refresh(ctx, owner.cookie).expect(401);
      await refresh(ctx, refreshCookie(rotated)).expect(200);
    });

    it('déconnexion : refresh et jeton d’accès deviennent inutilisables', async () => {
      const owner = await signupOwner(ctx);
      await ctx.http().post('/api/v1/auth/logout').set('Cookie', owner.cookie).set('X-Requested-With', 'test').expect(204);
      await refresh(ctx, owner.cookie).expect(401);
      await ctx.http().get('/api/v1/salons').set(bearer(owner)).expect(401);
    });

    it('déconnexion de tous les appareils', async () => {
      const owner = await signupOwner(ctx);
      const other = await login(ctx, owner.phone, owner.password);
      await ctx.http().post('/api/v1/auth/logout-all').set(bearer(owner)).expect(204);
      await ctx.http().get('/api/v1/salons').set(bearer(other)).expect(401);
      await refresh(ctx, other.cookie).expect(401);
    });
  });

  describe('récupération du mot de passe', () => {
    it('ne révèle pas si un numéro a un compte', async () => {
      const unknown = await ctx.http().post('/api/v1/auth/password/forgot').send({ phone: uniquePhone() }).expect(202);
      const owner = await signupOwner(ctx);
      const known = await ctx.http().post('/api/v1/auth/password/forgot').send({ phone: owner.phone }).expect(202);
      expect(known.body).toEqual(unknown.body);
    });

    it('réinitialise avec le code reçu, révoque les sessions et lève le verrouillage', async () => {
      const owner = await signupOwner(ctx);
      for (let i = 0; i < 5; i++) {
        await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: 'mauvais' });
      }
      await ctx.http().post('/api/v1/auth/password/forgot').send({ phone: owner.phone }).expect(202);
      const code = ctx.messaging.lastMessageTo(owner.phone, 'PASSWORD_RESET')!.code!;
      expect(code).toMatch(/^\d{6}$/);
      const stored = await ctx.admin.verificationCode.findFirstOrThrow({ where: { target: owner.phone } });
      expect(stored.codeHash).not.toContain(code);

      const wrong = code === '000000' ? '111111' : '000000';
      await ctx.http().post('/api/v1/auth/password/reset').send({ phone: owner.phone, code: wrong, newPassword: 'nouveau-mdp-1' }).expect(400);
      await ctx.http().post('/api/v1/auth/password/reset').send({ phone: owner.phone, code, newPassword: 'nouveau-mdp-1' }).expect(204);

      await ctx.http().get('/api/v1/salons').set(bearer(owner)).expect(401);
      await ctx.http().post('/api/v1/auth/login').send({ identifier: owner.phone, password: owner.password }).expect(401);
      await login(ctx, owner.phone, 'nouveau-mdp-1');
      // Code à usage unique.
      await ctx.http().post('/api/v1/auth/password/reset').send({ phone: owner.phone, code, newPassword: 'encore-autre-1' }).expect(400);
    });

    it('invalide le code après 5 essais erronés', async () => {
      const owner = await signupOwner(ctx);
      await ctx.http().post('/api/v1/auth/password/forgot').send({ phone: owner.phone }).expect(202);
      const code = ctx.messaging.lastMessageTo(owner.phone, 'PASSWORD_RESET')!.code!;
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await ctx.http().post('/api/v1/auth/password/reset').send({ phone: owner.phone, code: wrong, newPassword: 'nouveau-mdp-1' }).expect(400);
      }
      await ctx.http().post('/api/v1/auth/password/reset').send({ phone: owner.phone, code, newPassword: 'nouveau-mdp-1' }).expect(400);
    });

    it('limite à 3 codes par heure et par numéro', async () => {
      const owner = await signupOwner(ctx);
      for (let i = 0; i < 5; i++) {
        await ctx.http().post('/api/v1/auth/password/forgot').send({ phone: owner.phone }).expect(202);
      }
      expect(await ctx.admin.verificationCode.count({ where: { target: owner.phone } })).toBe(3);
    });

    it('changement de mot de passe : déconnecte les autres appareils, garde celui-ci', async () => {
      const owner = await signupOwner(ctx);
      const other = await login(ctx, owner.phone, owner.password);
      await ctx.http().post('/api/v1/auth/password/change').set(bearer(owner)).send({ currentPassword: 'faux-mot-de-passe', newPassword: 'nouveau-mdp-1' }).expect(403);
      await ctx.http().post('/api/v1/auth/password/change').set(bearer(owner)).send({ currentPassword: owner.password, newPassword: 'nouveau-mdp-1' }).expect(204);
      await ctx.http().get('/api/v1/salons').set(bearer(owner)).expect(200);
      await ctx.http().get('/api/v1/salons').set(bearer(other)).expect(401);
    });
  });
});
