/**
 * Désigne un membre de l'équipe plateforme (premier super administrateur notamment).
 * Le compte doit exister (inscription normale par téléphone).
 *
 *   PLATFORM_DATABASE_URL=… npm run platform:grant -- +22670000000 [PLATFORM_OWNER|PLATFORM_BILLING|PLATFORM_SUPPORT]
 *
 * Ensuite, l'équipe se gère depuis la console (/plateforme → Paramètres → Équipe).
 */
import { PlatformRole, PrismaClient } from '@prisma/client';

async function main() {
  const [rawPhone, rawRole = 'PLATFORM_OWNER'] = process.argv.slice(2);
  const roles = Object.values(PlatformRole) as string[];
  if (!rawPhone || !roles.includes(rawRole)) {
    console.error(`Usage : npm run platform:grant -- <téléphone> [${roles.join('|')}]`);
    process.exit(1);
  }
  const url = process.env.PLATFORM_DATABASE_URL ?? process.env.DATABASE_MIGRATION_URL;
  if (!url) throw new Error('PLATFORM_DATABASE_URL (ou DATABASE_MIGRATION_URL) est requis.');
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const digits = rawPhone.replace(/[^\d+]/g, '');
    const phone = digits.startsWith('+') ? digits : digits.length === 8 ? `+226${digits}` : `+${digits}`;
    const user = await prisma.user.findUnique({ where: { phone }, select: { id: true, fullName: true } });
    if (!user) throw new Error(`Aucun compte avec le numéro ${phone}.`);
    const role = rawRole as PlatformRole;
    await prisma.platformStaff.upsert({ where: { userId: user.id }, create: { userId: user.id, role }, update: { role, isActive: true } });
    await prisma.auditLog.create({ data: { tenantId: null, actorUserId: null, action: 'platform.staff_granted', entityType: 'user', entityId: user.id, after: { role, via: 'cli' } } });
    console.log(`${user.fullName} (${phone}) : ${role}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
