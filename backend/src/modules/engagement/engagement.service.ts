import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/numbering.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';

@Injectable()
export class EngagementService {
  constructor(
    private prisma: PrismaService,
    private numbering: NumberingService,
    private pushNotifications: PushNotificationsService,
  ) {}

  // ---- Fidélité ----
  createLoyaltyRule(dto: any) {
    return this.prisma.loyaltyRule.create({ data: dto });
  }

  findLoyaltyRules() {
    return this.prisma.loyaltyRule.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async updateLoyaltyRule(id: string, dto: any) {
    const rule = await this.prisma.loyaltyRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Règle de fidélité introuvable.');
    return this.prisma.loyaltyRule.update({ where: { id }, data: dto });
  }

  // ---- Promotions ----
  createPromotion(dto: any) {
    return this.prisma.promotion.create({ data: dto });
  }

  findPromotions(activeOnly = false) {
    return this.prisma.promotion.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async validatePromoCode(code: string) {
    const promo = await this.prisma.promotion.findUnique({ where: { code } });
    if (!promo || !promo.isActive) throw new NotFoundException('Code promo invalide ou expiré.');
    const now = new Date();
    if (promo.startsAt && promo.startsAt > now) throw new BadRequestException('Ce code promo n\'est pas encore actif.');
    if (promo.endsAt && promo.endsAt < now) throw new BadRequestException('Ce code promo a expiré.');
    return promo;
  }

  // ---- Avis ----
  async createReview(dto: { clientId: string; orderId: string; rating: number; comment?: string; quality?: number; punctuality?: number; welcome?: number }) {
    const existing = await this.prisma.review.findUnique({ where: { orderId: dto.orderId } });
    if (existing) throw new BadRequestException('Un avis existe déjà pour cette commande.');
    return this.prisma.review.create({ data: dto });
  }

  findReviews(clientId?: string) {
    return this.prisma.review.findMany({
      where: clientId ? { clientId } : {},
      include: { client: true, order: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---- Réclamations ----
  async createComplaint(dto: { clientId: string; orderId?: string; subject: string; description: string }) {
    const complaintNumber = await this.numbering.next('REC');
    const complaint = await this.prisma.complaint.create({
      data: { ...dto, complaintNumber },
      include: { client: { select: { fullName: true } } },
    });

    this.pushNotifications
      .sendToRoles([RoleName.ADMIN, RoleName.GERANT], {
        title: '⚠️ Nouvelle réclamation',
        body: `${complaint.client.fullName} — ${complaint.subject}`,
        url: '/admin/reclamations',
      })
      .catch(() => null);

    return complaint;
  }

  findComplaints(status?: string, clientId?: string) {
    return this.prisma.complaint.findMany({
      where: { ...(status ? { status: status as any } : {}), ...(clientId ? { clientId } : {}) },
      include: { client: true, order: true, handledBy: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateComplaint(id: string, dto: { status?: string; resolution?: string; handledById?: string }) {
    const complaint = await this.prisma.complaint.findUnique({ where: { id } });
    if (!complaint) throw new NotFoundException('Réclamation introuvable.');
    return this.prisma.complaint.update({ where: { id }, data: dto as any });
  }
}
