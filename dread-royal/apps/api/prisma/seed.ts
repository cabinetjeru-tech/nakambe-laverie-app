/**
 * Données de base (production) : rôles, compte propriétaire, catalogue, catégories.
 * Aucune donnée commerciale fictive. Idempotent : peut être relancé sans dupliquer.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { DEFAULT_ROLES } from '@dread-royal/shared';
import { EXPENSE_CATEGORIES, PACKAGES, PRODUCT_CATEGORIES, SERVICE_CATEGORIES, SERVICES } from './catalog';

const prisma = new PrismaClient();

async function main() {
  for (const r of DEFAULT_ROLES) {
    await prisma.role.upsert({ where: { code: r.code }, create: { ...r, permissions: r.permissions as string[], isSystem: true }, update: {} });
  }
  if ((await prisma.user.count()) === 0) {
    const username = (process.env.OWNER_USERNAME ?? 'proprietaire').toLowerCase();
    const password = process.env.OWNER_PASSWORD;
    if (!password || password.length < 8) throw new Error('Définissez OWNER_PASSWORD (8 caractères minimum) dans .env');
    const owner = await prisma.role.findUniqueOrThrow({ where: { code: 'OWNER' } });
    await prisma.user.create({ data: { username, fullName: 'Propriétaire DREAD ROYAL', roleId: owner.id, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true } });
    console.log(`Compte propriétaire créé : ${username} (changement de mot de passe demandé à la 1re connexion)`);
  }
  for (const c of SERVICE_CATEGORIES) await prisma.serviceCategory.upsert({ where: { code: c.code }, create: c, update: {} });
  const cats = await prisma.serviceCategory.findMany();
  for (const s of SERVICES) {
    await prisma.service.upsert({
      where: { code: s.code },
      create: { code: s.code, name: s.name, description: s.description, categoryId: cats.find((c) => c.code === s.cat)!.id, price: s.price, priceMax: s.priceMax, durationMin: s.duration, commissionType: s.commissionType ?? 'PERCENT', commissionValue: s.commission ?? 30 },
      update: {},
    });
  }
  for (const c of EXPENSE_CATEGORIES) await prisma.expenseCategory.upsert({ where: { code: c.code }, create: c, update: {} });
  for (const c of PRODUCT_CATEGORIES) await prisma.productCategory.upsert({ where: { code: c.code }, create: c, update: {} });
  const services = await prisma.service.findMany();
  for (const p of PACKAGES) {
    const { services: codes, ...data } = p;
    await prisma.loyaltyPackage.upsert({ where: { code: p.code }, create: { ...data, serviceIds: services.filter((s) => codes.includes(s.code)).map((s) => s.id) }, update: {} });
  }
  console.log(`Base initialisée : ${SERVICES.length} prestations, ${EXPENSE_CATEGORIES.length} catégories de dépenses, ${PACKAGES.length} forfaits.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
