import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { isSettingKey, SETTING_DEFINITIONS, SettingKey, SettingValue } from './settings.defaults';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class SettingsService {
  private cache: { values: Map<string, unknown>; loadedAt: number } | null = null;

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private async load(): Promise<Map<string, unknown>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) return this.cache.values;
    const rows = await this.prisma.appSetting.findMany();
    const values = new Map<string, unknown>(rows.map((r) => [r.key, r.value]));
    this.cache = { values, loadedAt: Date.now() };
    return values;
  }

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const values = await this.load();
    const def = SETTING_DEFINITIONS[key];
    const stored = values.get(key);
    return (stored !== undefined && def.validate(stored) ? stored : def.default) as SettingValue<K>;
  }

  async list() {
    const values = await this.load();
    return (Object.keys(SETTING_DEFINITIONS) as SettingKey[]).map((key) => {
      const def = SETTING_DEFINITIONS[key];
      const stored = values.get(key);
      return {
        key,
        value: stored !== undefined && def.validate(stored) ? stored : def.default,
        defaultValue: def.default,
        description: def.description,
        isDefault: stored === undefined,
      };
    });
  }

  async set(key: string, value: unknown, actorId: string) {
    if (!isSettingKey(key)) throw new NotFoundException(`Paramètre inconnu : ${key}`);
    const def = SETTING_DEFINITIONS[key];
    if (!def.validate(value)) throw new BadRequestException(`Valeur invalide pour ${key}.`);
    const before = await this.get(key);
    await this.prisma.appSetting.upsert({
      where: { key },
      create: { key, value: value as Prisma.InputJsonValue, description: def.description, updatedById: actorId },
      update: { value: value as Prisma.InputJsonValue, updatedById: actorId },
    });
    this.cache = null;
    await this.audit.log({ actorId, action: 'setting.update', entityType: 'AppSetting', entityId: key, before: { value: before }, after: { value } });
    return { key, value };
  }
}
