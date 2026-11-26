import { execSync } from 'child_process';

export const JSON_DB_URL = 'postgresql://dreadroyal:dreadroyal_dev@localhost:5432/dread_royal_test_json?schema=public';

async function reset(url: string) {
  const { PrismaClient } = require('@prisma/client');
  const env = { ...process.env, DATABASE_URL: url };
  const admin = new PrismaClient({ datasources: { db: { url: url.replace(/\/[^/?]+\?/, '/postgres?') } } });
  const db = new URL(url).pathname.slice(1);
  const exists = await admin.$queryRawUnsafe(`SELECT 1 FROM pg_database WHERE datname = '${db}'`);
  if (!(exists as unknown[]).length) await admin.$executeRawUnsafe(`CREATE DATABASE "${db}"`);
  await admin.$disconnect();
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$disconnect();
  execSync('npx prisma migrate deploy', { env, stdio: 'ignore', cwd: __dirname + '/..' });
  execSync('npx ts-node --transpile-only prisma/seed.ts', { env, stdio: 'ignore', cwd: __dirname + '/..' });
}

/** Bases de test vierges : schéma recréé puis données de base (seed). */
export default async function () {
  require('./env');
  await reset(process.env.DATABASE_URL!);
  await reset(JSON_DB_URL);
}
