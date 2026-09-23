import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ComplaintStatus, FilePurpose, LedgerTransactionType, Prisma } from '@prisma/client';
import { randomInt } from 'crypto';
import { AuditService } from '../../audit/audit.service';
import { AuthUser } from '../../common/auth-user';
import { paginate } from '../../common/dto/pagination.dto';
import { hasPermissions } from '../../common/guards/permissions.guard';
import { PERMISSIONS } from '../../common/permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../storage/storage.service';
import { LedgerService } from '../wallet/ledger.service';
import { ComplaintMessageDto, ComplaintQueryDto, CreateComplaintDto, UpdateComplaintDto } from './complaints.dto';

export const COMPLAINT_CATEGORY_LABELS = {
  RETARD: 'Retard',
  COLIS_ENDOMMAGE: 'Colis endommagé',
  COLIS_PERDU: 'Colis perdu',
  PAIEMENT: 'Paiement',
  COMPORTEMENT: 'Comportement',
  AUTRE: 'Autre',
};

@Injectable()
export class ComplaintsService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private ledger: LedgerService,
    private audit: AuditService,
  ) {}

  async create(user: AuthUser, dto: CreateComplaintDto) {
    let cityId: string | undefined;
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order || (order.clientId !== user.id && order.driverId !== user.id)) throw new NotFoundException('Commande introuvable.');
      cityId = order.cityId;
    }
    if (dto.attachmentKey) await this.storage.assertOwned(dto.attachmentKey, user.id, [FilePurpose.COMPLAINT]);
    const reference = `RC-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${String(randomInt(100_000)).padStart(5, '0')}`;
    const complaint = await this.prisma.complaint.create({
      data: {
        reference,
        orderId: dto.orderId,
        userId: user.id,
        category: dto.category,
        description: dto.description,
        messages: dto.attachmentKey ? { create: { authorId: user.id, body: 'Photo jointe', attachmentKey: dto.attachmentKey } } : undefined,
      },
    });
    await this.notifications.notifyStaff(
      PERMISSIONS.COMPLAINTS_MANAGE.code,
      {
        type: 'ADMIN_ALERT',
        title: `Réclamation ${reference}`,
        body: `${COMPLAINT_CATEGORY_LABELS[dto.category]} — ${dto.description.slice(0, 100)}`,
        url: `/admin/reclamations/${complaint.id}`,
      },
      cityId,
    );
    return complaint;
  }

  mine(userId: string) {
    return this.prisma.complaint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { id: true, reference: true } } },
    });
  }

  async detail(user: AuthUser, id: string) {
    const staff = hasPermissions(user, [PERMISSIONS.COMPLAINTS_MANAGE.code]);
    const complaint = await this.prisma.complaint.findUnique({
      where: { id },
      include: {
        order: { select: { id: true, reference: true, status: true, driverId: true, clientId: true } },
        user: { select: { id: true, firstName: true, lastName: true, phone: true } },
        messages: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!complaint || (!staff && complaint.userId !== user.id)) throw new NotFoundException('Réclamation introuvable.');
    return {
      ...complaint,
      messages: complaint.messages
        .filter((m) => staff || !m.isInternal)
        .map((m) => ({ ...m, attachmentUrl: this.storage.signedUrl(m.attachmentKey), attachmentKey: undefined })),
    };
  }

  async addMessage(user: AuthUser, id: string, dto: ComplaintMessageDto) {
    const staff = hasPermissions(user, [PERMISSIONS.COMPLAINTS_MANAGE.code]);
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint || (!staff && complaint.userId !== user.id)) throw new NotFoundException('Réclamation introuvable.');
    if (!staff && dto.isInternal) throw new ForbiddenException();
    if (dto.attachmentKey) await this.storage.assertOwned(dto.attachmentKey, user.id, [FilePurpose.COMPLAINT]);
    const message = await this.prisma.complaintMessage.create({
      data: { complaintId: id, authorId: user.id, body: dto.body, attachmentKey: dto.attachmentKey, isInternal: staff && !!dto.isInternal },
    });
    if (staff && !dto.isInternal) {
      await this.notifications.notify(complaint.userId, {
        type: 'COMPLAINT',
        title: `Réponse à votre réclamation ${complaint.reference}`,
        body: dto.body.slice(0, 150),
        url: `/reclamations/${id}`,
      });
      if (complaint.status === ComplaintStatus.OPEN) {
        await this.prisma.complaint.update({ where: { id }, data: { status: ComplaintStatus.IN_PROGRESS } });
      }
    }
    return message;
  }

  async list(query: ComplaintQueryDto) {
    const where: Prisma.ComplaintWhereInput = { status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.complaint.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        ...paginate(query),
        include: {
          user: { select: { firstName: true, lastName: true, phone: true } },
          order: { select: { id: true, reference: true } },
        },
      }),
      this.prisma.complaint.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  /** Traitement par l'équipe ; un remboursement éventuel est crédité sur le portefeuille du client. */
  async update(id: string, dto: UpdateComplaintDto, actor: AuthUser) {
    const before = await this.prisma.complaint.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Réclamation introuvable.');
    if (dto.refundAmount) {
      if (!hasPermissions(actor, [PERMISSIONS.PAYMENTS_VALIDATE.code])) {
        throw new ForbiddenException('Un remboursement nécessite le droit de valider les paiements.');
      }
      if (before.refundAmount) throw new BadRequestException('Cette réclamation a déjà donné lieu à un remboursement.');
    }
    const resolved = dto.status === ComplaintStatus.RESOLVED || dto.status === ComplaintStatus.REJECTED;
    const complaint = await this.prisma.$transaction(async (tx) => {
      if (dto.refundAmount) {
        const platform = await this.ledger.systemWallet('PLATFORM_REVENUE', tx);
        const wallet = await this.ledger.userWallet('CLIENT', before.userId, tx);
        await this.ledger.post(
          {
            type: LedgerTransactionType.REFUND,
            description: `Geste commercial — réclamation ${before.reference}`,
            orderId: before.orderId ?? undefined,
            createdById: actor.id,
            lines: [
              { walletId: platform.id, amount: -dto.refundAmount },
              { walletId: wallet.id, amount: dto.refundAmount },
            ],
          },
          tx,
        );
      }
      return tx.complaint.update({
        where: { id },
        data: { ...dto, resolvedAt: resolved ? new Date() : undefined },
      });
    });
    await this.audit.log({ actorId: actor.id, action: 'complaint.update', entityType: 'Complaint', entityId: id, before, after: complaint });
    if (resolved || dto.refundAmount) {
      await this.notifications.notify(complaint.userId, {
        type: 'COMPLAINT',
        title: `Réclamation ${complaint.reference} ${complaint.status === ComplaintStatus.RESOLVED ? 'résolue' : 'mise à jour'}`,
        body: [complaint.resolution, dto.refundAmount ? `${dto.refundAmount} FCFA crédités sur votre portefeuille.` : null].filter(Boolean).join(' ') || 'Consultez le détail.',
        url: `/reclamations/${id}`,
      });
    }
    return complaint;
  }
}
