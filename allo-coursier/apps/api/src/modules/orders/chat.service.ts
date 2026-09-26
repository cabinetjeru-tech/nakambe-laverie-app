import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { FilePurpose, MessageType, OrderStatus } from '@prisma/client';
import { AuthUser } from '../../common/auth-user';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import { StorageService } from '../storage/storage.service';
import { SendMessageDto } from './dto/orders.dto';
import { OrdersService } from './orders.service';

const QUICK_REPLIES = {
  CLIENT: ['Je suis là', 'J’arrive dans 5 minutes', 'Appelez-moi s’il vous plaît', 'Merci !'],
  DRIVER: ['Je suis arrivé', 'Je suis en route', 'Je ne trouve pas l’adresse', 'Pouvez-vous m’appeler ?'],
};

@Injectable()
export class ChatService {
  constructor(
    private prisma: PrismaService,
    private orders: OrdersService,
    private realtime: RealtimeService,
    private notifications: NotificationsService,
    private settings: SettingsService,
    private storage: StorageService,
  ) {}

  quickReplies() {
    return QUICK_REPLIES;
  }

  private async conversationFor(orderId: string, clientId: string) {
    const existing = await this.prisma.conversation.findFirst({ where: { orderId, type: 'ORDER' } });
    if (existing) return existing;
    return this.prisma.conversation.create({
      data: { orderId, type: 'ORDER', participants: { create: { userId: clientId, role: 'CLIENT' } } },
    });
  }

  private toView(m: { id: string; senderId: string | null; clientMessageId: string | null; type: MessageType; body: string | null; attachmentKey: string | null; lat: number | null; lng: number | null; createdAt: Date }) {
    return { ...m, attachmentUrl: this.storage.signedUrl(m.attachmentKey), attachmentKey: undefined };
  }

  async list(user: AuthUser, orderId: string, after?: Date) {
    const { order } = await this.orders.assertCanView(user, orderId);
    const conversation = await this.conversationFor(orderId, order.clientId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id, ...(after ? { createdAt: { gt: after } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    const participants = await this.prisma.conversationParticipant.findMany({ where: { conversationId: conversation.id } });
    return {
      messages: messages.map((m) => this.toView(m)),
      participants: participants.map((p) => ({ userId: p.userId, role: p.role, lastReadAt: p.lastReadAt })),
    };
  }

  async send(user: AuthUser, orderId: string, dto: SendMessageDto) {
    const { order: ref, staff } = await this.orders.assertCanView(user, orderId);
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!staff) {
      const openHours = await this.settings.get('chat.openHoursAfterDelivery');
      const closedAt = order.deliveredAt ?? order.cancelledAt;
      const closed =
        order.status === OrderStatus.CANCELLED ||
        (closedAt && closedAt.getTime() + openHours * 3600_000 < Date.now());
      if (closed) throw new BadRequestException('Le chat de cette commande est fermé. Utilisez « Réclamation » si besoin.');
    }
    const existing = await this.prisma.message.findUnique({ where: { clientMessageId: dto.clientMessageId } });
    if (existing) {
      if (existing.senderId !== user.id) throw new ForbiddenException();
      return this.toView(existing); // renvoi après coupure réseau : pas de doublon
    }
    if (dto.type === 'LOCATION' && (dto.lat == null || dto.lng == null)) throw new BadRequestException('Position manquante.');
    if (dto.type === 'IMAGE') {
      if (!dto.attachmentKey) throw new BadRequestException('Photo manquante.');
      await this.storage.assertOwned(dto.attachmentKey, user.id, [FilePurpose.CHAT]);
    }
    if ((dto.type === 'TEXT' || dto.type === 'QUICK_REPLY') && !dto.body?.trim()) throw new BadRequestException('Message vide.');

    const conversation = await this.conversationFor(orderId, ref.clientId);
    const role = user.id === ref.clientId ? 'CLIENT' : user.id === ref.driverId ? 'DRIVER' : 'SUPPORT';
    await this.prisma.conversationParticipant.upsert({
      where: { conversationId_userId: { conversationId: conversation.id, userId: user.id } },
      create: { conversationId: conversation.id, userId: user.id, role, lastReadAt: new Date() },
      update: { lastReadAt: new Date() },
    });
    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderId: user.id,
        clientMessageId: dto.clientMessageId,
        type: dto.type,
        body: dto.body?.trim(),
        lat: dto.lat,
        lng: dto.lng,
        attachmentKey: dto.attachmentKey,
      },
    });
    const view = this.toView(message);
    this.realtime.toChat(orderId, 'chat.message', { orderId, message: view, senderRole: role });

    const recipients = [ref.clientId, ref.driverId].filter((id): id is string => !!id && id !== user.id);
    const preview = dto.type === 'IMAGE' ? '📷 Photo' : dto.type === 'LOCATION' ? '📍 Position partagée' : dto.body!.slice(0, 120);
    const sender = role === 'CLIENT' ? 'Le client' : role === 'DRIVER' ? 'Le livreur' : 'Le service client';
    for (const recipient of recipients) {
      await this.notifications.notify(recipient, {
        type: 'CHAT',
        title: `${sender} — ${order.reference}`,
        body: preview,
        url: recipient === ref.driverId ? `/livreur/missions/${orderId}` : `/commandes/${orderId}`,
        data: { orderId },
      });
    }
    return view;
  }

  async markRead(user: AuthUser, orderId: string) {
    const { order } = await this.orders.assertCanView(user, orderId);
    const conversation = await this.conversationFor(orderId, order.clientId);
    await this.prisma.conversationParticipant.updateMany({
      where: { conversationId: conversation.id, userId: user.id },
      data: { lastReadAt: new Date() },
    });
    return { success: true };
  }
}
