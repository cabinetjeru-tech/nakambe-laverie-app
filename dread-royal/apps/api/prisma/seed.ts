/** Données de base (production) — voir src/seed/base-data.ts. */
import { PrismaClient } from '@prisma/client';
import { seedBaseData } from '../src/seed/base-data';

const prisma = new PrismaClient();
seedBaseData(prisma, { username: process.env.OWNER_USERNAME ?? 'proprietaire', password: process.env.OWNER_PASSWORD ?? '' })
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
