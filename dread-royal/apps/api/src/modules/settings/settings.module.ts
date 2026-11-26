import { BadRequestException, Body, Controller, Get, Global, Injectable, Module, Param, Put } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../common/audit.service';
import { ClientIp, CurrentUser, RequirePermissions } from '../../common/decorators';
import { AuthUser } from '../../common/auth-user';

export const DEFAULT_SETTINGS = {
  salon: {
    name: 'DREAD ROYAL',
    subtitle: 'African Hair & Dreadlocks Studio',
    slogan: 'Votre couronne, votre identité.',
    address: 'Ouagadougou, Burkina Faso',
    city: 'Ouagadougou',
    phone: '',
    email: '',
    ifu: '', // Identifiant Financier Unique (DGI Burkina Faso)
    rccm: '',
    taxRegime: 'CME', // Contribution des Micro-Entreprises — à confirmer avec le comptable
    invoiceFooter: 'Merci de votre confiance. Votre couronne, votre identité.',
  },
  loyalty: {
    enabled: true,
    amountPerPoint: 1000, // 1 point pour 1 000 FCFA payés
    pointValue: 25, // 1 point = 25 FCFA de réduction
    minRedeemPoints: 100,
    maxRedeemPercent: 50, // la fidélité couvre au plus 50 % d'une vente
  },
  treasury: {
    openingDate: null as string | null,
    openingBalances: { CASH: 0, ORANGE_MONEY: 0, MOOV_MONEY: 0, BANK_TRANSFER: 0, OTHER: 0 } as Record<string, number>,
  },
  appointments: { openingHour: 8, closingHour: 21, slotMinutes: 30 },
};
export type SettingsShape = typeof DEFAULT_SETTINGS;
export type SettingKey = keyof SettingsShape;

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  async get<K extends SettingKey>(key: K): Promise<SettingsShape[K]> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    return { ...(DEFAULT_SETTINGS[key] as object), ...((row?.value as object) ?? {}) } as SettingsShape[K];
  }

  async all() {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) out[k] = await this.get(k);
    return out;
  }

  async set(key: string, value: Record<string, unknown>, actor: AuthUser, ip?: string) {
    if (!(key in DEFAULT_SETTINGS)) throw new BadRequestException('Paramètre inconnu');
    const before = await this.get(key as SettingKey);
    const allowed = Object.keys(DEFAULT_SETTINGS[key as SettingKey]);
    const clean = Object.fromEntries(Object.entries(value).filter(([k]) => allowed.includes(k)));
    const merged = { ...before, ...clean };
    if (key === 'loyalty') {
      const l = merged as SettingsShape['loyalty'];
      if (l.amountPerPoint < 1 || l.pointValue < 0 || l.maxRedeemPercent < 0 || l.maxRedeemPercent > 100) throw new BadRequestException('Règles de fidélité invalides');
    }
    await this.prisma.setting.upsert({ where: { key }, create: { key, value: merged as any }, update: { value: merged as any } });
    await this.audit.log({ userId: actor.id, action: 'UPDATE', entity: 'Setting', entityId: key, summary: `Paramètres « ${key} »`, before, after: merged, ip });
    return merged;
  }
}

@Controller('settings')
export class SettingsController {
  constructor(private s: SettingsService) {}
  /** Lecture : tous les utilisateurs connectés (nécessaire pour les documents). */
  @Get() all() { return this.s.all(); }
  @Put(':key')
  @RequirePermissions('settings.manage')
  set(@Param('key') key: string, @Body() body: Record<string, unknown>, @CurrentUser() u: AuthUser, @ClientIp() ip: string) {
    return this.s.set(key, body, u, ip);
  }
}

@Global()
@Module({ controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
