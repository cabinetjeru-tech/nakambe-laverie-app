import { randomInt } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MessagingService } from '../src/core/messaging/messaging.service';
import { setupApp } from '../src/setup-app';

export interface TestContext {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  messaging: MessagingService;
  /** Connexion propriétaire (hors RLS) pour préparer ou inspecter la base. */
  admin: PrismaClient;
  close: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  setupApp(app);
  await app.init();
  const admin = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATION_URL });
  return {
    app,
    http: () => request(app.getHttpServer()),
    messaging: app.get(MessagingService),
    admin,
    close: async () => {
      await admin.$disconnect();
      await app.close();
    },
  };
}

const usedPhones = new Set<string>();
/** Numéro burkinabè aléatoire, unique pour la durée des tests. */
export function uniquePhone(): string {
  let phone: string;
  do {
    phone = `+2267${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  } while (usedPhones.has(phone));
  usedPhones.add(phone);
  return phone;
}

export function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('salons_rt='));
  if (!cookie) throw new Error('Cookie de session absent');
  return cookie.split(';')[0];
}

export interface Account {
  phone: string;
  password: string;
  accessToken: string;
  cookie: string;
  tenantId: string | null;
  permissions: string[];
}

export async function signupOwner(ctx: TestContext, overrides: Record<string, string> = {}): Promise<Account & { tenantId: string }> {
  const phone = uniquePhone();
  const password = 'motdepasse-solide-1';
  const res = await ctx
    .http()
    .post('/api/v1/auth/signup')
    .send({ fullName: 'Awa Traoré', phone, password, businessName: 'Beauté Divine', salonName: 'Beauté Divine Centre', city: 'Ouagadougou', ...overrides })
    .expect(201);
  return {
    phone,
    password,
    accessToken: res.body.accessToken,
    cookie: refreshCookie(res),
    tenantId: res.body.activeTenant.tenantId,
    permissions: res.body.activeTenant.permissions,
  };
}

export async function login(ctx: TestContext, identifier: string, password: string): Promise<Account> {
  const res = await ctx.http().post('/api/v1/auth/login').send({ identifier, password }).expect(200);
  return {
    phone: identifier,
    password,
    accessToken: res.body.accessToken,
    cookie: refreshCookie(res),
    tenantId: res.body.activeTenant?.tenantId ?? null,
    permissions: res.body.activeTenant?.permissions ?? [],
  };
}

export function bearer(account: { accessToken: string }) {
  return { Authorization: `Bearer ${account.accessToken}` };
}

export function refresh(ctx: TestContext, cookie: string) {
  return ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'test');
}

/** Invite un membre et accepte l'invitation avec un nouveau compte ; renvoie la session du membre. */
export async function inviteAndAccept(
  ctx: TestContext,
  inviter: { accessToken: string },
  roleCode: string,
  scope: { allSalons: boolean; salonIds: string[] },
): Promise<Account & { membershipId: string }> {
  const roles = await ctx.http().get('/api/v1/roles').set(bearer(inviter)).expect(200);
  const role = roles.body.find((r: { code: string }) => r.code === roleCode);
  const phone = uniquePhone();
  const invitation = await ctx
    .http()
    .post('/api/v1/invitations')
    .set(bearer(inviter))
    .send({ phone, roleId: role.id, ...scope })
    .expect(201);
  const token = invitation.body.link.split('#')[1];
  const password = 'mot-de-passe-membre';
  const res = await ctx
    .http()
    .post('/api/v1/auth/invitations/accept')
    .send({ token, fullName: 'Membre Test', password })
    .expect(201);
  return {
    phone,
    password,
    accessToken: res.body.accessToken,
    cookie: refreshCookie(res),
    tenantId: res.body.activeTenant.tenantId,
    permissions: res.body.activeTenant.permissions,
    membershipId: res.body.activeTenant.membershipId,
  };
}
