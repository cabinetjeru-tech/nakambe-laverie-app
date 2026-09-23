import { randomBytes } from 'node:crypto';
import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { DbService } from '../../core/db/db.service';
import { RESERVED_SLUGS, slugify } from '../../core/http/slug';
import { DEFAULT_ROLES, OWNER_ROLE_CODE } from '../../core/permissions/catalog';
import { CryptoService } from '../../core/security/crypto.service';
import { TenantDefaultsService } from '../../core/tenant/tenant-defaults.service';

export interface NewTenantInput {
  ownerUserId: string;
  ownerName: string;
  businessName: string;
  salonName: string;
  city: string;
}

/**
 * Crée une entreprise prête à l'emploi : tenant en essai, abonnement SaaS, rôles système,
 * premier salon, adhésion « Propriétaire » et profil professionnel du propriétaire.
 * S'exécute dans la transaction courante ; le contexte bascule sur le nouveau tenant.
 */
@Injectable()
export class TenantProvisioningService {
  constructor(
    private readonly db: DbService,
    private readonly crypto: CryptoService,
    private readonly defaults: TenantDefaultsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async provision(input: NewTenantInput): Promise<{ tenantId: string; salonId: string }> {
    const tx = this.db.tx;
    const plan = await tx.plan.findFirst({ where: { code: this.config.DEFAULT_PLAN_CODE, isActive: true } });
    if (!plan) {
      throw new ServiceUnavailableException("Les offres ne sont pas configurées (lancer le seed de référence).");
    }

    const now = new Date();
    const trialEnd = new Date(now.getTime() + this.config.TRIAL_DAYS * 24 * 3600 * 1000);
    const tenant = await tx.tenant.create({
      data: {
        slug: await this.uniqueTenantSlug(input.businessName),
        legalName: input.businessName,
        displayName: input.businessName,
        planId: plan.id,
        status: 'TRIAL',
        trialEndsAt: trialEnd,
        dataKeyEnc: this.crypto.newWrappedDataKey(),
      },
    });

    // Toutes les écritures suivantes portent sur des tables tenant : RLS active sur ce tenant.
    await this.db.setContext({ tenantId: tenant.id, userId: input.ownerUserId });

    await tx.saasSubscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        cycle: 'MONTHLY',
        status: 'TRIALING',
        unitPrice: plan.priceMonthly,
        currency: plan.currency,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
      },
    });

    let ownerRoleId = '';
    for (const role of DEFAULT_ROLES) {
      const created = await tx.role.create({
        data: {
          tenantId: tenant.id,
          code: role.code,
          name: role.name,
          description: role.description,
          isSystem: true,
          permissions:
            role.permissions === '*'
              ? undefined
              : { create: role.permissions.map((permissionCode) => ({ permissionCode })) },
        },
      });
      if (role.code === OWNER_ROLE_CODE) ownerRoleId = created.id;
    }

    const salon = await tx.salon.create({
      data: { tenantId: tenant.id, slug: slugify(input.salonName), name: input.salonName, city: input.city },
    });

    const membership = await tx.membership.create({
      data: {
        tenantId: tenant.id,
        userId: input.ownerUserId,
        allSalons: true,
        roles: { create: [{ roleId: ownerRoleId }] },
      },
    });

    await this.defaults.openingHoursForNewSalon(salon.id);
    await this.defaults.ensureExpenseCategories();

    const ownerStaff = await tx.staffMember.create({
      data: {
        tenantId: tenant.id,
        membershipId: membership.id,
        displayName: input.ownerName,
        salons: { create: [{ salonId: salon.id }] },
      },
    });
    await this.defaults.ensureStaffSchedule(ownerStaff.id, salon.id);

    return { tenantId: tenant.id, salonId: salon.id };
  }

  private async uniqueTenantSlug(businessName: string): Promise<string> {
    const base = slugify(businessName, 32);
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = attempt === 0 && !RESERVED_SLUGS.has(base) ? base : `${base}-${randomBytes(3).toString('hex')}`;
      const taken = await this.db.tx.tenant.findUnique({ where: { slug: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    return `${base}-${randomBytes(6).toString('hex')}`;
  }
}
