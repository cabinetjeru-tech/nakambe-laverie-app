import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { PlatformDbService } from './platform-db.service';

const mobileMoneySchema = z.array(z.object({ operator: z.string().min(2).max(40), number: z.string().min(6).max(20) })).max(6);

/** Paramètres modifiables depuis la console super administrateur (validés à l'écriture). */
export const platformSettingsSchema = z.object({
  legalName: z.string().min(2).max(200),
  address: z.string().max(300),
  taxId: z.string().max(60),
  supportPhone: z.string().max(30),
  supportEmail: z.string().max(120),
  mobileMoney: mobileMoneySchema,
  trialDays: z.number().int().min(0).max(90),
  graceDays: z.number().int().min(0).max(30),
  renewalLeadDays: z.number().int().min(1).max(30),
  vatPercent: z.number().min(0).max(30),
  defaultPlanCode: z.string().min(1).max(30),
});

export type PlatformSettings = z.infer<typeof platformSettingsSchema>;
export type PlatformSettingKey = keyof PlatformSettings;

const CACHE_MS = 30_000;

/**
 * Paramètres de la plateforme : valeur en base (table platform_settings) si elle existe,
 * sinon valeur de l'environnement. Mis en cache 30 s par instance ; une modification depuis
 * la console vide le cache de l'instance qui la reçoit.
 */
@Injectable()
export class PlatformSettingsService {
  private cache: { value: PlatformSettings; at: number } | null = null;

  constructor(
    private readonly platform: PlatformDbService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  defaults(): PlatformSettings {
    const c = this.config;
    return {
      legalName: c.PLATFORM_LEGAL_NAME,
      address: c.PLATFORM_ADDRESS,
      taxId: c.PLATFORM_TAX_ID,
      supportPhone: '',
      supportEmail: '',
      mobileMoney: c.PLATFORM_MOBILE_MONEY.split(';')
        .map((entry) => entry.split(':').map((part) => part.trim()))
        .filter(([operator, number]) => operator && number)
        .map(([operator, number]) => ({ operator, number })),
      trialDays: c.TRIAL_DAYS,
      graceDays: c.BILLING_GRACE_DAYS,
      renewalLeadDays: c.BILLING_RENEWAL_LEAD_DAYS,
      vatPercent: c.BILLING_VAT_PERCENT,
      defaultPlanCode: c.DEFAULT_PLAN_CODE,
    };
  }

  async get(): Promise<PlatformSettings> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const rows = await this.platform.client.platformSetting.findMany();
    const merged: Record<string, unknown> = { ...this.defaults() };
    for (const row of rows) {
      const field = platformSettingsSchema.shape[row.key as PlatformSettingKey];
      // Une valeur invalide en base (modifiée à la main) est ignorée : on garde la valeur par défaut.
      if (field && field.safeParse(row.value).success) merged[row.key] = row.value;
    }
    const value = merged as PlatformSettings;
    this.cache = { value, at: Date.now() };
    return value;
  }

  /** Mise à jour partielle ; renvoie les paramètres complets après modification. */
  async update(patch: Partial<PlatformSettings>, userId: string): Promise<PlatformSettings> {
    const parsed = platformSettingsSchema.partial().parse(patch);
    await this.platform.transaction(async (tx) => {
      for (const [key, value] of Object.entries(parsed)) {
        if (value === undefined) continue;
        await tx.platformSetting.upsert({
          where: { key },
          create: { key, value: value as Prisma.InputJsonValue, updatedBy: userId },
          update: { value: value as Prisma.InputJsonValue, updatedBy: userId },
        });
      }
    });
    this.cache = null;
    return this.get();
  }
}
