import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/env';

export type PlatformTx = Prisma.TransactionClient;

/**
 * Connexion « plateforme » (rôle PostgreSQL salons_platform, BYPASSRLS).
 *
 * Réservée à ce qui traverse les tenants PAR NATURE : moteur de facturation (planificateur,
 * webhooks des agrégateurs, dont on ne connaît pas le tenant à l'arrivée) et console de
 * l'éditeur. Elle n'est jamais utilisée pour servir une requête d'un salon sur ses propres
 * données métier : celles-ci passent toujours par DbService (RLS).
 * Chaque requête écrite ici filtre explicitement par tenant_id.
 */
@Injectable()
export class PlatformDbService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = new PrismaClient({ datasourceUrl: config.PLATFORM_DATABASE_URL });
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  transaction<T>(fn: (tx: PlatformTx) => Promise<T>): Promise<T> {
    return this.client.$transaction(fn, { maxWait: 5_000, timeout: 30_000 });
  }
}
