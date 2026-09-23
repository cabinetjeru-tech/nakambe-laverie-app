/**
 * Données de référence de la plateforme : offres et catalogue des permissions.
 *
 * À exécuter avec le rôle PROPRIÉTAIRE des tables (le rôle salons_app n'a pas le droit
 * d'écrire dans ces tables) :
 *   DATABASE_URL="$DATABASE_MIGRATION_URL" npm run prisma:seed
 *
 * Idempotent : peut être relancé à chaque déploiement.
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSION_DEFINITIONS, PLAN_DEFINITIONS } from '../src/core/permissions/catalog';

export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  for (const [index, plan] of PLAN_DEFINITIONS.entries()) {
    const data = {
      name: plan.name,
      priceMonthly: BigInt(plan.priceMonthly),
      priceYearly: BigInt(plan.priceYearly),
      maxSalons: plan.maxSalons,
      maxStaff: plan.maxStaff,
      smsQuotaMonthly: plan.smsQuotaMonthly,
      sortOrder: index,
    };
    const saved = await prisma.plan.upsert({ where: { code: plan.code }, create: { code: plan.code, ...data }, update: data });
    await prisma.planFeature.deleteMany({ where: { planId: saved.id, featureCode: { notIn: [...plan.features] } } });
    await prisma.planFeature.createMany({
      data: plan.features.map((featureCode) => ({ planId: saved.id, featureCode })),
      skipDuplicates: true,
    });
  }

  for (const permission of PERMISSION_DEFINITIONS) {
    const data = {
      groupName: permission.group,
      description: permission.description,
      featureCode: 'feature' in permission ? permission.feature : null,
    };
    await prisma.permission.upsert({ where: { code: permission.code }, create: { code: permission.code, ...data }, update: data });
  }
  // Permissions retirées du catalogue : supprimées (et retirées des rôles par cascade).
  await prisma.permission.deleteMany({ where: { code: { notIn: PERMISSION_DEFINITIONS.map((p) => p.code) } } });
}

if (require.main === module) {
  const prisma = new PrismaClient();
  seedReferenceData(prisma)
    .then(() => console.log('Données de référence à jour (offres, permissions).'))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
