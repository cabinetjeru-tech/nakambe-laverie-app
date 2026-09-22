/**
 * Données initiales ALLÔ-COURSIER.
 * Idempotent : peut être relancé sans dupliquer ni écraser les réglages faits dans l'administration.
 *
 *  - catalogue des permissions et rôles par défaut ;
 *  - villes de lancement : Ouagadougou et Tenkodogo ;
 *  - tarifs de DÉMONSTRATION (à ajuster dans l'administration avant le lancement) ;
 *  - compte super-administrateur (SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD) ;
 *  - hors production : un client et un livreur de démonstration.
 */
import 'dotenv/config';
import { DriverStatus, EmploymentType, PrismaClient, SecretKind, ServiceType, VehicleType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { ALL_PERMISSIONS_WILDCARD, DEFAULT_ROLES, PERMISSIONS, ROLE } from '../src/common/permissions';
import { normalizeBurkinaPhone } from '../src/common/utils/phone';
import { passwordPolicyError } from '../src/common/utils/secret-policy';

const prisma = new PrismaClient();
const BCRYPT_COST = 12;

async function seedPermissionsAndRoles() {
  for (const p of Object.values(PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { code: p.code },
      create: p,
      update: { group: p.group, description: p.description },
    });
  }
  const permissions = await prisma.permission.findMany();
  for (const def of DEFAULT_ROLES) {
    const existing = await prisma.role.findUnique({ where: { code: def.code } });
    if (existing) continue; // les droits ont pu être ajustés dans l'administration : on n'y touche pas
    const codes = def.permissions === ALL_PERMISSIONS_WILDCARD ? [] : def.permissions;
    await prisma.role.create({
      data: {
        code: def.code,
        name: def.name,
        description: def.description,
        isSystem: true,
        permissions: {
          create: permissions.filter((p) => (codes as string[]).includes(p.code)).map((p) => ({ permissionId: p.id })),
        },
      },
    });
  }
  console.log(`✔ ${permissions.length} permissions, ${DEFAULT_ROLES.length} rôles`);
}

async function seedCities() {
  const cities = [
    { slug: 'ouagadougou', name: 'Ouagadougou', centerLat: 12.3714, centerLng: -1.5197, serviceRadiusKm: 15 },
    { slug: 'tenkodogo', name: 'Tenkodogo', centerLat: 11.78, centerLng: -0.3697, serviceRadiusKm: 8 },
  ];
  for (const c of cities) {
    await prisma.city.upsert({ where: { slug: c.slug }, create: c, update: {} });
  }
  console.log('✔ Villes : Ouagadougou, Tenkodogo');
}

/** Tarifs de démonstration — valeurs indicatives, à valider par GROUPE AKAMBI SARL. */
async function seedDemoPricing() {
  const demo: Record<string, { name: string; vehicleType: VehicleType | null; serviceType: ServiceType | null; params: Record<string, number | string | null> }[]> = {
    ouagadougou: [
      {
        name: 'Ouagadougou — moto (démo)',
        vehicleType: VehicleType.MOTO,
        serviceType: null,
        params: {
          baseFare: 500, minFare: 1000, pricePerKm: 150, includedKm: 2,
          expressFixed: 500, expressPercent: 0,
          waitingFreeMinutes: 10, waitingPricePerMinute: 25,
          nightSurcharge: 300, nightStart: '21:00', nightEnd: '06:00',
          purchaseFeePercent: 10, purchaseFeeMin: 200, extraStopFee: 300,
          commissionPercent: 20, roundingStep: 50,
        },
      },
      {
        name: 'Ouagadougou — tricycle (démo)',
        vehicleType: VehicleType.TRICYCLE,
        serviceType: null,
        params: {
          baseFare: 1500, minFare: 2500, pricePerKm: 300, includedKm: 2,
          expressFixed: 1000, expressPercent: 0,
          waitingFreeMinutes: 15, waitingPricePerMinute: 50,
          nightSurcharge: 500, nightStart: '21:00', nightEnd: '06:00',
          purchaseFeePercent: 10, purchaseFeeMin: 300, extraStopFee: 500,
          commissionPercent: 20, roundingStep: 50,
        },
      },
    ],
    tenkodogo: [
      {
        name: 'Tenkodogo — moto (démo)',
        vehicleType: VehicleType.MOTO,
        serviceType: null,
        params: {
          baseFare: 300, minFare: 700, pricePerKm: 100, includedKm: 2,
          expressFixed: 300, expressPercent: 0,
          waitingFreeMinutes: 10, waitingPricePerMinute: 25,
          nightSurcharge: 200, nightStart: '21:00', nightEnd: '06:00',
          purchaseFeePercent: 10, purchaseFeeMin: 200, extraStopFee: 200,
          commissionPercent: 20, roundingStep: 50,
        },
      },
      {
        name: 'Tenkodogo — tricycle (démo)',
        vehicleType: VehicleType.TRICYCLE,
        serviceType: null,
        params: {
          baseFare: 1000, minFare: 1500, pricePerKm: 200, includedKm: 2,
          expressFixed: 500, expressPercent: 0,
          waitingFreeMinutes: 15, waitingPricePerMinute: 50,
          nightSurcharge: 300, nightStart: '21:00', nightEnd: '06:00',
          purchaseFeePercent: 10, purchaseFeeMin: 300, extraStopFee: 300,
          commissionPercent: 20, roundingStep: 50,
        },
      },
    ],
  };
  for (const [slug, rules] of Object.entries(demo)) {
    const city = await prisma.city.findUniqueOrThrow({ where: { slug } });
    if ((await prisma.pricingRule.count({ where: { cityId: city.id } })) > 0) continue;
    for (const r of rules) {
      await prisma.pricingRule.create({
        data: {
          name: r.name,
          cityId: city.id,
          vehicleType: r.vehicleType,
          serviceType: r.serviceType,
          validFrom: new Date('2026-01-01T00:00:00Z'),
          ...(r.params as object),
        } as never,
      });
    }
  }
  console.log('✔ Tarifs de démonstration (seulement pour les villes sans tarif)');
}

async function seedSuperAdmin() {
  const phone = normalizeBurkinaPhone(process.env.SEED_ADMIN_PHONE ?? '');
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!phone || passwordPolicyError(password)) {
    console.warn('⚠ SEED_ADMIN_PHONE / SEED_ADMIN_PASSWORD absents ou invalides : aucun super-administrateur créé.');
    return;
  }
  if (await prisma.user.findUnique({ where: { phone } })) return;
  const role = await prisma.role.findUniqueOrThrow({ where: { code: ROLE.SUPER_ADMIN } });
  await prisma.user.create({
    data: {
      phone,
      firstName: 'Administrateur',
      lastName: 'Allô-Coursier',
      secretKind: SecretKind.PASSWORD,
      secretHash: await bcrypt.hash(password, BCRYPT_COST),
      roles: { create: { roleId: role.id } },
    },
  });
  console.log(`✔ Super-administrateur : ${phone}`);
}

async function seedDemoAccounts() {
  if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO === 'false') return;
  const pinHash = await bcrypt.hash('482913', BCRYPT_COST);
  const ouaga = await prisma.city.findUniqueOrThrow({ where: { slug: 'ouagadougou' } });
  const clientRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLE.CLIENT } });
  const driverRole = await prisma.role.findUniqueOrThrow({ where: { code: ROLE.DRIVER } });

  if (!(await prisma.user.findUnique({ where: { phone: '+22676000001' } }))) {
    await prisma.user.create({
      data: {
        phone: '+22676000001', firstName: 'Awa', lastName: 'Ouédraogo (démo)',
        secretHash: pinHash, roles: { create: { roleId: clientRole.id } },
        addresses: {
          create: {
            label: 'Maison', lat: 12.3569, lng: -1.5352, cityId: ouaga.id, isDefault: true,
            landmark: 'Près du marché de Gounghin, portail bleu',
          },
        },
      },
    });
  }
  if (!(await prisma.user.findUnique({ where: { phone: '+22676000002' } }))) {
    await prisma.user.create({
      data: {
        phone: '+22676000002', firstName: 'Issouf', lastName: 'Sawadogo (démo)',
        secretHash: pinHash, roles: { create: { roleId: driverRole.id } },
        driverProfile: {
          create: {
            cityId: ouaga.id, vehicleType: VehicleType.MOTO, employmentType: EmploymentType.INDEPENDANT,
            plateNumber: '11 GJ 4521', status: DriverStatus.APPROVED, approvedAt: new Date(),
          },
        },
      },
    });
  }
  console.log('✔ Comptes de démonstration : client +22676000001 / livreur +22676000002 (code 482913)');
}

async function main() {
  await seedPermissionsAndRoles();
  await seedCities();
  await seedDemoPricing();
  await seedSuperAdmin();
  await seedDemoAccounts();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
