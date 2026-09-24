import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { BillingEngine } from './billing-engine.service';

/** Clé du verrou consultatif PostgreSQL : une seule passe à la fois, même avec plusieurs instances. */
const LOCK_KEY = 72_410_001;

/**
 * Planificateur de facturation : toutes les BILLING_TICK_SECONDS, émission des factures de
 * renouvellement, rappels, passage en impayé, suspension automatique, résiliations.
 * Le moteur est idempotent ; le verrou évite seulement du travail en double.
 */
@Injectable()
export class BillingScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BillingScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly engine: BillingEngine,
    private readonly platform: PlatformDbService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (this.config.BILLING_SCHEDULER !== 'on') return;
    this.timer = setInterval(() => void this.tick(), this.config.BILLING_TICK_SECONDS * 1000);
    this.timer.unref();
    setTimeout(() => void this.tick(), 5_000).unref();
    this.logger.log(`Planificateur de facturation actif (toutes les ${this.config.BILLING_TICK_SECONDS} s).`);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.platform.client.$transaction(
        async (tx) => {
          const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
          if (!locked) return;
          const result = await this.engine.runDue(new Date());
          if (result.processed > 0) this.logger.log(`Facturation : ${result.processed} abonnement(s) examiné(s), ${result.errors} erreur(s).`);
        },
        { maxWait: 5_000, timeout: 15 * 60_000 },
      );
    } catch (error) {
      this.logger.error(`Passe de facturation interrompue : ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
