import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import request from 'supertest';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://allo:allo_dev_pwd@localhost:5432/allo_coursier_test?schema=public';

export function configureTestEnv() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.JWT_ACCESS_SECRET = 'secret-de-test-suffisamment-long-pour-les-tests';
  process.env.THROTTLE_DISABLED = 'true';
  process.env.DISABLE_SCHEDULER = 'true';
  process.env.SEED_ADMIN_PHONE = '+22670000000';
  process.env.SEED_ADMIN_PASSWORD = 'AlloAdmin@2026';
  process.env.UPLOAD_DIR = '/tmp/allo-coursier-test-uploads';
}

/** Applique les migrations, vide toutes les tables de la base de TEST puis relance le seed. */
export async function resetTestDatabase() {
  const dbName = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`Par sécurité, les tests e2e ne s'exécutent que sur une base dont le nom finit par _test (reçu : ${dbName}).`);
  }
  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore' });
  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await prisma.$disconnect();
  execSync('npx ts-node --transpile-only prisma/seed.ts', { env, stdio: 'ignore' });
}

export async function createTestApp(): Promise<{ app: INestApplication; http: ReturnType<typeof request> }> {
  const { AppModule } = await import('../src/app.module');
  const { setupApp } = await import('../src/setup-app');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = setupApp(moduleRef.createNestApplication());
  await app.init();
  return { app, http: request(app.getHttpServer()) };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Plus petite image JPEG valide (1 × 1 pixel), pour tester les envois de photos. */
export const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64',
);
