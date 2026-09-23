import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedReferenceData } from '../prisma/seed';

/** Applique les migrations, vide la base de test et recharge les données de référence. */
export default async function globalSetup() {
  require('./env');
  const ownerUrl = process.env.DATABASE_MIGRATION_URL!;
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: ownerUrl }, stdio: 'pipe' });

  const prisma = new PrismaClient({ datasourceUrl: ownerUrl });
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    const list = tables.map((t) => `"${t.tablename}"`).join(', ');
    await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    await seedReferenceData(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
