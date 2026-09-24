import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { AuditService } from '../../core/audit/audit.service';
import { DbService } from '../../core/db/db.service';
import { CreateTicketDto } from './support.dto';

/**
 * Support côté salon (connexion de l'API, RLS) : un salon ne voit que ses tickets, et la
 * politique RLS masque les notes internes de l'équipe plateforme.
 * Tout membre peut ouvrir un ticket ; seuls les responsables de l'abonnement (ou le
 * propriétaire) voient les tickets des autres membres.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  list(user: AuthUser) {
    return this.db.tx.supportTicket.findMany({
      where: this.visibleTo(user),
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
      select: { id: true, number: true, subject: true, category: true, status: true, priority: true, lastMessageAt: true, createdAt: true },
    });
  }

  async detail(user: AuthUser, id: string) {
    const ticket = await this.db.tx.supportTicket.findFirst({
      where: { id, ...this.visibleTo(user) },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, body: true, fromPlatform: true, authorUserId: true, createdAt: true },
        },
      },
    });
    if (!ticket) throw new NotFoundException('Demande introuvable.');
    const authors = await this.db.tx.user.findMany({
      where: { id: { in: [...new Set(ticket.messages.filter((m) => !m.fromPlatform).map((m) => m.authorUserId))] } },
      select: { id: true, fullName: true },
    });
    const names = new Map(authors.map((a) => [a.id, a.fullName]));
    return {
      ...ticket,
      assignedToId: undefined,
      messages: ticket.messages.map(({ authorUserId, ...m }) => ({
        ...m,
        // L'identité des agents n'est pas exposée : « Équipe support ».
        authorName: m.fromPlatform ? 'Équipe support' : names.get(authorUserId) ?? 'Membre',
      })),
    };
  }

  async create(user: AuthUser, dto: CreateTicketDto) {
    const tx = this.db.tx;
    const tenantId = user.tenantId!;
    const sequence = await tx.documentSequence.upsert({
      where: { tenantId_docType_year: { tenantId, docType: 'SUPPORT', year: 0 } },
      create: { tenantId, docType: 'SUPPORT', year: 0, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    const ticket = await tx.supportTicket.create({
      data: {
        tenantId,
        number: sequence.value,
        subject: dto.subject.trim(),
        category: dto.category,
        priority: dto.category === 'billing' ? 'HIGH' : 'NORMAL',
        createdByUserId: user.userId,
        messages: { create: { authorUserId: user.userId, body: dto.body.trim() } },
      },
      select: { id: true, number: true, status: true },
    });
    await this.audit.log({ action: 'support.ticket_created', entityType: 'support_ticket', entityId: ticket.id });
    return ticket;
  }

  async reply(user: AuthUser, id: string, body: string) {
    const ticket = await this.db.tx.supportTicket.findFirst({ where: { id, ...this.visibleTo(user) }, select: { id: true, status: true } });
    if (!ticket) throw new NotFoundException('Demande introuvable.');
    if (ticket.status === 'CLOSED') throw new ConflictException('Cette demande est clôturée : ouvrez-en une nouvelle.');
    const now = new Date();
    await this.db.tx.supportMessage.create({ data: { tenantId: user.tenantId!, ticketId: id, authorUserId: user.userId, body: body.trim() } });
    // Le salon a répondu : la demande repasse « en attente de la plateforme ».
    await this.db.tx.supportTicket.update({ where: { id }, data: { status: 'OPEN', lastMessageAt: now, resolvedAt: null } });
  }

  async close(user: AuthUser, id: string) {
    const ticket = await this.db.tx.supportTicket.findFirst({ where: { id, ...this.visibleTo(user) }, select: { id: true } });
    if (!ticket) throw new NotFoundException('Demande introuvable.');
    await this.db.tx.supportTicket.update({ where: { id }, data: { status: 'CLOSED', resolvedAt: new Date() } });
  }

  private visibleTo(user: AuthUser) {
    const seesAll = user.permissions.includes('billing.manage') || user.permissions.includes('settings.manage');
    return seesAll ? {} : { createdByUserId: user.userId };
  }
}
