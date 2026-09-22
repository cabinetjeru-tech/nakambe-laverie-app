import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserStatus } from '@prisma/client';
import * as webpush from 'web-push';
import { PermissionCode, ROLE } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';

export interface NotificationInput {
  type: string; // ORDER_STATUS, NEW_OFFER, CHAT, PAYMENT, DRIVER, ADMIN_ALERT, BROADCAST...
  title: string;
  body: string;
  /** Lien ouvert au clic sur la notification (ex. /commandes/123). */
  url?: string;
  data?: Record<string, unknown>;
}

/**
 * Point d'entrée unique des notifications : enregistrement en base (historique « cloche »),
 * diffusion en temps réel si l'application est ouverte, et notification push (Web Push, gratuit)
 * si l'utilisateur l'a autorisée. Un canal SMS pourra s'ajouter ici via un SmsProvider.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private pushEnabled = false;

  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    if (publicKey && privateKey) {
      webpush.setVapidDetails(this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:contact@allo-coursier.bf', publicKey, privateKey);
      this.pushEnabled = true;
    } else {
      this.logger.warn('Notifications push désactivées : VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY non définies.');
    }
  }

  get pushPublicKey(): string | null {
    return this.pushEnabled ? this.config.get<string>('VAPID_PUBLIC_KEY') ?? null : null;
  }

  async notify(userIds: string | string[], input: NotificationInput): Promise<void> {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
    if (ids.length === 0) return;
    const data = { ...(input.data ?? {}), url: input.url } as Prisma.InputJsonValue;
    await this.prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, type: input.type, title: input.title, body: input.body, data })),
    });
    for (const userId of ids) {
      this.realtime.toUser(userId, 'notification', { type: input.type, title: input.title, body: input.body, url: input.url, data: input.data });
    }
    // Le push ne doit jamais bloquer ni faire échouer l'action métier.
    void this.sendPush(ids, input);
  }

  /** Notifie les membres de l'équipe qui ont une permission donnée (optionnellement limités à une ville). */
  async notifyStaff(permission: PermissionCode, input: NotificationInput, cityId?: string) {
    const users = await this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        roles: {
          some: {
            OR: [
              { role: { code: ROLE.SUPER_ADMIN } },
              {
                role: { permissions: { some: { permission: { code: permission } } } },
                ...(cityId ? { OR: [{ cityId: null }, { cityId }] } : {}),
              },
            ],
          },
        },
      },
      select: { id: true },
    });
    await this.notify(users.map((u) => u.id), input);
  }

  private async sendPush(userIds: string[], input: NotificationInput) {
    if (!this.pushEnabled) return;
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const payload = JSON.stringify({ title: input.title, body: input.body, url: input.url ?? '/', type: input.type });
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 3600, urgency: input.type === 'NEW_OFFER' ? 'high' : 'normal' },
          );
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => undefined);
          } else {
            this.logger.warn(`Échec d'envoi push (${status ?? 'erreur réseau'})`);
          }
        }
      }),
    );
  }

  // ------------------------------------------------------------------ historique

  async list(userId: string, limit = 30) {
    const [items, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return { items, unread };
  }

  async markRead(userId: string, ids?: string[]) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
    return { success: true };
  }

  async subscribe(userId: string, sub: { endpoint: string; p256dh: string; auth: string }, userAgent?: string) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { ...sub, userId, userAgent },
      update: { ...sub, userId, userAgent },
    });
    return { success: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { success: true };
  }
}
