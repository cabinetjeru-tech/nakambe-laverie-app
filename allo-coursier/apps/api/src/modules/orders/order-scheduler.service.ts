import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { DispatchService } from './dispatch.service';
import { OrderLifecycleService, SYSTEM_ACTOR } from './order-lifecycle.service';
import { OrdersService } from './orders.service';

const TICK_MS = 5_000;
const RETRY_SEARCH_AFTER_MS = 20_000;

/**
 * Tâches automatiques, exécutées toutes les 5 secondes à partir de l'état en base
 * (rien n'est perdu en cas de redémarrage du serveur) :
 * expiration des offres, relance de la recherche, livraisons programmées, alertes,
 * paiements Mobile Money non validés, clôture des commandes livrées.
 * Prévu pour une seule instance de l'API (suffisant pour le lancement).
 */
@Injectable()
export class OrderSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private dispatch: DispatchService,
    private orders: OrdersService,
    private lifecycle: OrderLifecycleService,
    private settings: SettingsService,
  ) {}

  onModuleInit() {
    if (process.env.DISABLE_SCHEDULER === 'true') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.step('offres expirées', () => this.dispatch.expireDueOffers());
      await this.step('livraisons programmées', () => this.dispatch.releaseScheduledOrders());
      await this.step('relance de la recherche', () => this.retrySearches());
      await this.step('alertes', () => this.dispatch.alertStuckOrders());
      await this.step('paiements non validés', () => this.cancelUnpaidOrders());
      await this.step('clôture', () => this.completeDeliveredOrders());
    } finally {
      this.running = false;
    }
  }

  private async step(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
    } catch (err) {
      this.logger.error(`Tâche « ${name} » en échec`, err as Error);
    }
  }

  async retrySearches() {
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.SEARCHING_DRIVER,
        OR: [{ lastDispatchAt: null }, { lastDispatchAt: { lt: new Date(Date.now() - RETRY_SEARCH_AFTER_MS) } }],
        offers: { none: { status: 'OFFERED' } },
      },
      select: { id: true },
      take: 50,
    });
    for (const { id } of orders) await this.dispatch.trigger(id);
    return orders.length;
  }

  async cancelUnpaidOrders() {
    const minutes = await this.settings.get('payments.manualTimeoutMinutes');
    const orders = await this.prisma.order.findMany({
      where: {
        status: OrderStatus.PENDING_PAYMENT,
        createdAt: { lt: new Date(Date.now() - minutes * 60_000) },
        payments: { none: { status: PaymentStatus.PENDING } },
      },
      select: { id: true },
    });
    for (const { id } of orders) {
      await this.orders
        .cancel(id, [OrderStatus.PENDING_PAYMENT], { id: null, role: 'SYSTEM' }, 'Paiement Mobile Money non reçu dans le délai')
        .catch((err) => this.logger.warn(`Annulation automatique impossible : ${(err as Error).message}`));
    }
    return orders.length;
  }

  async completeDeliveredOrders() {
    const hours = await this.settings.get('orders.autoCompleteHours');
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.DELIVERED, deliveredAt: { lt: new Date(Date.now() - hours * 3600_000) } },
      select: { id: true },
      take: 200,
    });
    for (const { id } of orders) {
      await this.prisma.$transaction((tx) =>
        this.lifecycle.transition(tx, id, [OrderStatus.DELIVERED], OrderStatus.COMPLETED, SYSTEM_ACTOR, { note: 'Clôture automatique' }),
      );
    }
    return orders.length;
  }
}
