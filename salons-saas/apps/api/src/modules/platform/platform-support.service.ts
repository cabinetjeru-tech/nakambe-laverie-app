import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PlatformDbService } from '../../core/platform/platform-db.service';
import { TicketQueryDto, UpdateTicketDto } from '../support/support.dto';
import { platformAudit } from './platform-audit';

const PRIORITY_ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 } as const;

/** Super administrateur — Support : file des demandes de tous les salons. */
@Injectable()
export class PlatformSupportService {
  constructor(private readonly platform: PlatformDbService) {}

  async list(actorUserId: string, query: TicketQueryDto) {
    const where: Prisma.SupportTicketWhereInput = {};
    if (query.status) where.status = query.status;
    else where.status = { in: ['OPEN', 'PENDING'] };
    if (query.priority) where.priority = query.priority;
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.assigned === 'me') where.assignedToId = actorUserId;
    if (query.assigned === 'none') where.assignedToId = null;
    const tickets = await this.platform.client.supportTicket.findMany({
      where,
      orderBy: { lastMessageAt: 'asc' },
      take: 300,
      select: {
        id: true,
        number: true,
        subject: true,
        category: true,
        status: true,
        priority: true,
        assignedToId: true,
        lastMessageAt: true,
        createdAt: true,
        tenant: { select: { id: true, displayName: true, status: true } },
        _count: { select: { messages: true } },
      },
    });
    // Les plus urgentes d'abord, puis celles qui attendent depuis le plus longtemps.
    tickets.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.lastMessageAt.getTime() - b.lastMessageAt.getTime());
    const counts = await this.platform.client.supportTicket.groupBy({ by: ['status'], _count: { _all: true } });
    return { counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])), items: tickets };
  }

  async detail(ticketId: string) {
    const db = this.platform.client;
    const ticket = await db.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        tenant: { select: { id: true, displayName: true, status: true, plan: { select: { name: true } } } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!ticket) throw new NotFoundException('Demande introuvable.');
    const userIds = [...new Set([ticket.createdByUserId, ...ticket.messages.map((m) => m.authorUserId), ...(ticket.assignedToId ? [ticket.assignedToId] : [])])];
    const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, fullName: true, phone: true } });
    const byId = new Map(users.map((u) => [u.id, u]));
    return {
      ...ticket,
      createdBy: byId.get(ticket.createdByUserId) ?? null,
      assignedTo: ticket.assignedToId ? byId.get(ticket.assignedToId) ?? null : null,
      messages: ticket.messages.map((m) => ({ ...m, authorName: byId.get(m.authorUserId)?.fullName ?? '—' })),
    };
  }

  /** Réponse au salon (notifiée au demandeur) ou note interne (invisible du salon). */
  async reply(actorUserId: string, ticketId: string, body: string, internal: boolean) {
    await this.platform.transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new NotFoundException('Demande introuvable.');
      const message = await tx.supportMessage.create({
        data: { tenantId: ticket.tenantId, ticketId, authorUserId: actorUserId, fromPlatform: true, internal, body: body.trim() },
      });
      if (internal) return;
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'PENDING', lastMessageAt: message.createdAt, assignedToId: ticket.assignedToId ?? actorUserId },
      });
      await tx.notification.createMany({
        data: [
          {
            tenantId: ticket.tenantId,
            recipientUserId: ticket.createdByUserId,
            channel: 'IN_APP',
            event: 'support.reply',
            title: `Réponse du support — demande n° ${ticket.number}`,
            body: body.trim().slice(0, 200),
            actionUrl: `/support/${ticketId}`,
            status: 'DELIVERED',
            sentAt: new Date(),
            dedupeKey: `support-reply-${message.id}`,
            relatedEntity: `support_ticket:${ticketId}`,
          },
        ],
        skipDuplicates: true,
      });
    });
  }

  async update(actorUserId: string, ticketId: string, dto: UpdateTicketDto) {
    await this.platform.transaction(async (tx) => {
      const ticket = await tx.supportTicket.findUnique({ where: { id: ticketId }, select: { tenantId: true } });
      if (!ticket) throw new NotFoundException('Demande introuvable.');
      if (dto.assignedToId) {
        const staff = await tx.platformStaff.findUnique({ where: { userId: dto.assignedToId } });
        if (!staff?.isActive) throw new NotFoundException('Agent introuvable dans l’équipe plateforme.');
      }
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: {
          status: dto.status,
          priority: dto.priority,
          assignedToId: dto.assignedToId,
          resolvedAt: dto.status === 'RESOLVED' || dto.status === 'CLOSED' ? new Date() : dto.status ? null : undefined,
        },
      });
      await platformAudit(tx, { tenantId: ticket.tenantId, actorUserId, action: 'platform.ticket_updated', entityType: 'support_ticket', entityId: ticketId, after: { ...dto } });
    });
  }
}
