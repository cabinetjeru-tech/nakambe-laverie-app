import { Injectable } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Crée une notification in-app. Les canaux WhatsApp/SMS/email ne sont pas
   * envoyés automatiquement ici (voir docs/01-ARCHITECTURE.md §8) — le lien
   * wa.me est généré côté frontend à partir du numéro du client.
   */
  async notify(params: {
    userId?: string;
    clientId?: string;
    orderId?: string;
    title: string;
    message: string;
    channel?: NotificationChannel;
  }) {
    return this.prisma.notification.create({
      data: {
        userId: params.userId,
        clientId: params.clientId,
        orderId: params.orderId,
        title: params.title,
        message: params.message,
        channel: params.channel ?? NotificationChannel.IN_APP,
        sentAt: new Date(),
      },
    });
  }

  findForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findForClient(clientId: string) {
    return this.prisma.notification.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }
}
