import { execSync } from 'child_process';

/** Base de test vierge : schéma recréé puis données de base (seed). */
export default async function () {
  require('./env');
  const env = { ...process.env };
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  await prisma.$disconnect();
  execSync('npx prisma migrate deploy', { env, stdio: 'inherit', cwd: __dirname + '/..' });
  execSync('npx ts-node --transpile-only prisma/seed.ts', { env, stdio: 'inherit', cwd: __dirname + '/..' });
}
