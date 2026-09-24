import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { FEATURES, FeatureCode } from '../../core/permissions/catalog';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { PlatformSettings, PlatformSettingsService } from '../../core/platform/platform-settings.service';
import { platformAudit } from './platform-audit';
import { PlanDto } from './platform.dto';

/** Fonctionnalités qu'une offre peut inclure (codes utilisés par le catalogue de permissions). */
export const PLAN_FEATURES: { code: FeatureCode; label: string }[] = [
  { code: FEATURES.ONLINE_BOOKING, label: 'Réservation en ligne' },
  { code: FEATURES.STOCK, label: 'Gestion du stock' },
  { code: FEATURES.COMMISSIONS, label: 'Commissions des employés' },
  { code: FEATURES.INVOICING, label: 'Factures clients' },
  { code: FEATURES.LOYALTY, label: 'Fidélité et cartes cadeaux' },
  { code: FEATURES.MARKETING, label: 'Campagnes SMS / WhatsApp' },
  { code: FEATURES.MULTI_SALON, label: 'Plusieurs salons' },
  { code: FEATURES.CUSTOM_ROLES, label: 'Rôles personnalisés' },
  { code: FEATURES.API_ACCESS, label: 'Accès API et webhooks' },
];

/** Super administrateur — Paramètres : coordonnées, facturation, offres. */
@Injectable()
export class PlatformSettingsAdminService {
  constructor(
    private readonly platform: PlatformDbService,
    private readonly settings: PlatformSettingsService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async get() {
    const settings = await this.settings.get();
    return {
      settings,
      /** Réglages techniques (fichier .env, redémarrage nécessaire) : affichés, non modifiables ici. */
      technical: {
        paymentProvider: this.config.PAYMENT_PROVIDER,
        billingScheduler: this.config.BILLING_SCHEDULER,
        billingTickSeconds: this.config.BILLING_TICK_SECONDS,
        otpDriver: this.config.OTP_DRIVER,
        appPublicUrl: this.config.APP_PUBLIC_URL,
        apiPublicUrl: this.config.API_PUBLIC_URL,
        environment: this.config.NODE_ENV,
      },
      features: PLAN_FEATURES,
    };
  }

  async update(actorUserId: string, patch: Partial<PlatformSettings>) {
    const updated = await this.settings.update(patch, actorUserId);
    await this.platform.transaction((tx) =>
      platformAudit(tx, { tenantId: null, actorUserId, action: 'platform.settings_updated', entityType: 'platform', after: JSON.parse(JSON.stringify(patch)) }),
    );
    return updated;
  }

  async plans() {
    const plans = await this.platform.client.plan.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { features: { select: { featureCode: true } }, _count: { select: { tenants: true } } },
    });
    return plans.map(({ features, _count, ...plan }) => ({ ...plan, features: features.map((f) => f.featureCode), tenantsCount: _count.tenants }));
  }

  async createPlan(actorUserId: string, dto: PlanDto) {
    const code = dto.code.trim().toUpperCase();
    return this.platform.transaction(async (tx) => {
      if (await tx.plan.findUnique({ where: { code } })) throw new ConflictException('Une offre porte déjà ce code.');
      const plan = await tx.plan.create({
        data: { ...this.planData(dto), code, features: { create: dto.features.map((featureCode) => ({ featureCode })) } },
      });
      await platformAudit(tx, { tenantId: null, actorUserId, action: 'platform.plan_created', entityType: 'plan', entityId: plan.id, after: { code } });
      return plan;
    });
  }

  /**
   * Modification d'une offre. Les abonnements en cours gardent leur prix figé jusqu'au
   * renouvellement ; les limites et fonctionnalités s'appliquent immédiatement (les jetons
   * des membres concernés sont renouvelés).
   */
  async updatePlan(actorUserId: string, planId: string, dto: PlanDto) {
    return this.platform.transaction(async (tx) => {
      const existing = await tx.plan.findUnique({ where: { id: planId } });
      if (!existing) throw new NotFoundException('Offre introuvable.');
      if (dto.code.trim().toUpperCase() !== existing.code) throw new ConflictException('Le code d’une offre ne se modifie pas.');
      const plan = await tx.plan.update({ where: { id: planId }, data: this.planData(dto) });
      await tx.planFeature.deleteMany({ where: { planId } });
      await tx.planFeature.createMany({ data: dto.features.map((featureCode) => ({ planId, featureCode })) });
      await tx.membership.updateMany({ where: { tenant: { planId } }, data: { permissionsVersion: { increment: 1 } } });
      await platformAudit(tx, {
        tenantId: null,
        actorUserId,
        action: 'platform.plan_updated',
        entityType: 'plan',
        entityId: planId,
        after: JSON.parse(JSON.stringify({ ...dto, before: { priceMonthly: Number(existing.priceMonthly), priceYearly: Number(existing.priceYearly) } })),
      });
      return plan;
    });
  }

  private planData(dto: PlanDto) {
    return {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      priceMonthly: BigInt(dto.priceMonthly),
      priceYearly: BigInt(dto.priceYearly),
      maxSalons: dto.maxSalons ?? null,
      maxStaff: dto.maxStaff ?? null,
      smsQuotaMonthly: dto.smsQuotaMonthly,
      isPublic: dto.isPublic,
      isActive: dto.isActive,
      sortOrder: dto.sortOrder,
    };
  }
}
