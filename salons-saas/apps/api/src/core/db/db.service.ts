import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { APP_CONFIG, AppConfig } from '../../config/env';
import { TenantScopeState, tenantScopeExtension } from './tenant-scope.extension';

function createClient(url: string, getState: () => TenantScopeState | undefined) {
  return new PrismaClient({ datasourceUrl: url }).$extends(tenantScopeExtension(getState));
}

type ExtendedClient = ReturnType<typeof createClient>;

/** Client disponible à l'intérieur d'une transaction de contexte. */
export type DbTx = Omit<ExtendedClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'>;

export interface RequestMeta {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface DbContext {
  tenantId?: string | null;
  userId?: string | null;
  meta?: RequestMeta;
}

interface ContextStore extends TenantScopeState {
  tx: DbTx;
  meta: RequestMeta;
}

export class MissingDbContextError extends Error {
  constructor() {
    super("Accès à la base hors d'un contexte : passer par DbService.withContext (ou l'intercepteur)");
  }
}

const TX_OPTIONS = { maxWait: 5_000, timeout: 20_000 };

/**
 * Toute requête SQL de l'API passe par une transaction qui commence par
 *   set_config('app.tenant_id', …, true), set_config('app.user_id', …, true)
 * La Row-Level Security de PostgreSQL filtre alors chaque ligne sur ce tenant, et les
 * réglages disparaissent à la fin de la transaction (aucune fuite d'une requête à l'autre
 * via le pool de connexions).
 *
 * Le client de transaction courant est conservé dans un AsyncLocalStorage : les services
 * écrivent `this.db.tx.salon.findMany()` sans jamais manipuler le tenant eux-mêmes.
 */
@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  private readonly storage = new AsyncLocalStorage<ContextStore>();
  private readonly client: ExtendedClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createClient(config.DATABASE_URL, () => this.storage.getStore());
  }

  async onModuleInit() {
    await this.client.$connect();
  }

  async onModuleDestroy() {
    await this.client.$disconnect();
  }

  /** Client de la transaction courante. Lève une erreur hors contexte (défaut sûr). */
  get tx(): DbTx {
    const store = this.storage.getStore();
    if (!store) throw new MissingDbContextError();
    return store.tx;
  }

  get tenantId(): string | null {
    return this.storage.getStore()?.tenantId ?? null;
  }

  get userId(): string | null {
    return this.storage.getStore()?.userId ?? null;
  }

  get meta(): RequestMeta {
    return this.storage.getStore()?.meta ?? {};
  }

  get inContext(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /**
   * Exécute `fn` dans une nouvelle transaction portant le contexte donné.
   * Validée si `fn` réussit, annulée si elle lève une exception.
   */
  async withContext<T>(context: DbContext, fn: () => Promise<T>): Promise<T> {
    if (this.inContext) {
      throw new Error('Transaction de contexte déjà ouverte : utiliser setContext() ou detached()');
    }
    return this.run(context, fn);
  }

  /**
   * Transaction indépendante, validée même si la transaction englobante est annulée ensuite
   * (ex. compteur d'échecs de connexion, révocation d'une famille de sessions).
   */
  async detached<T>(context: DbContext, fn: () => Promise<T>): Promise<T> {
    return this.storage.exit(() => this.run(context, fn));
  }

  /** Change le contexte de la transaction courante (ex. après identification de l'utilisateur). */
  async setContext(context: DbContext): Promise<void> {
    const store = this.storage.getStore();
    if (!store) throw new MissingDbContextError();
    if (context.tenantId !== undefined) store.tenantId = context.tenantId;
    if (context.userId !== undefined) store.userId = context.userId;
    await this.applySettings(store.tx, store.tenantId, store.userId);
  }

  /**
   * Lecture des adhésions / fiches client de l'utilisateur courant dans tous ses tenants.
   * Le tenant courant est retiré le temps de `fn`, puis rétabli.
   */
  async asUserAcrossTenants<T>(fn: () => Promise<T>): Promise<T> {
    const store = this.storage.getStore();
    if (!store?.userId) throw new MissingDbContextError();
    const previousTenant = store.tenantId;
    await this.setContext({ tenantId: null });
    store.userScopeRead = true;
    try {
      return await fn();
    } finally {
      store.userScopeRead = false;
      await this.setContext({ tenantId: previousTenant });
    }
  }

  private run<T>(context: DbContext, fn: () => Promise<T>): Promise<T> {
    return this.client.$transaction(async (tx) => {
      const store: ContextStore = {
        tx: tx as DbTx,
        tenantId: context.tenantId ?? null,
        userId: context.userId ?? null,
        userScopeRead: false,
        meta: context.meta ?? {},
      };
      await this.applySettings(store.tx, store.tenantId, store.userId);
      // `await` DANS le contexte : une requête Prisma n'est exécutée qu'au moment où on
      // l'attend ; renvoyée telle quelle, elle partirait hors contexte (et serait refusée).
      return this.storage.run(store, async () => await fn());
    }, TX_OPTIONS);
  }

  private async applySettings(tx: DbTx, tenantId: string | null, userId: string | null) {
    await tx.$queryRaw`SELECT set_config('app.tenant_id', ${tenantId ?? ''}, true), set_config('app.user_id', ${userId ?? ''}, true)`;
  }
}
