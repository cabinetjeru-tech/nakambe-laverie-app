import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SavePushSubscriptionDto } from './dto/push-subscription.dto';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

@Injectable()
export class PushNotificationsService {
  private readonly logger = new Logger(PushNotificationsService.name);
  private configured = false;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private ensureConfigured() {
    if (this.configured) return true;
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:contact@nouvellelaverieafricaine.com';
    if (!publicKey || !privateKey) return false;
    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
    return true;
  }

  getPublicKey(): string | null {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  async subscribe(userId: string, dto: SavePushSubscriptionDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
    return { success: true };
  }

  async hasActiveSubscription(userId: string) {
    const count = await this.prisma.pushSubscription.count({ where: { userId } });
    return count > 0;
  }

  /** Envoie une notification push à tous les appareils d'un rôle donné (ex. ADMIN, GERANT). */
  async sendToRoles(roles: RoleName[], payload: PushPayload) {
    if (!this.ensureConfigured()) {
      this.logger.warn('VAPID non configuré — notification push ignorée.');
      return;
    }
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { user: { role: { name: { in: roles } } } },
    });
    await Promise.all(subscriptions.map((sub) => this.sendToSubscription(sub, payload)));
  }

  private async sendToSubscription(
    sub: { id: string; endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload),
      );
    } catch (err: any) {
      // Abonnement expiré ou révoqué par le navigateur : on le supprime pour ne plus réessayer.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await this.prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => null);
      } else {
        this.logger.warn(`Échec d'envoi push (${err?.statusCode ?? 'erreur'}) : ${err?.message}`);
      }
    }
  }
}
