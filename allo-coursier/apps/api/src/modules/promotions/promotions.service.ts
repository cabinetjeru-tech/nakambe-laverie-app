import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma, Promotion, PromotionType, ServiceType } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePromotionDto, UpdatePromotionDto } from './promotions.dto';
import { computeDiscount } from './promotions.logic';

export interface PromotionContext {
  userId: string;
  cityId: string;
  serviceType: ServiceType;
  deliveryFee: number;
  at: Date;
}

@Injectable()
export class PromotionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Vérifie un code promo et calcule la remise ; lève une erreur lisible s'il n'est pas applicable. */
  async evaluate(code: string, ctx: PromotionContext, tx: Prisma.TransactionClient = this.prisma) {
    const promo = await tx.promotion.findUnique({ where: { code: code.trim().toUpperCase() } });
    const invalid = (reason: string) => new BadRequestException(`Code promo non applicable : ${reason}`);
    if (!promo || !promo.isActive) throw invalid('code inconnu ou désactivé.');
    if (promo.startsAt > ctx.at || (promo.endsAt && promo.endsAt <= ctx.at)) throw invalid("il n'est pas valable à cette date.");
    if (promo.cityId && promo.cityId !== ctx.cityId) throw invalid("il n'est pas valable dans cette ville.");
    if (promo.serviceType && promo.serviceType !== ctx.serviceType) throw invalid("il n'est pas valable pour ce service.");
    if (promo.minOrderAmount && ctx.deliveryFee < promo.minOrderAmount) {
      throw invalid(`montant minimum de ${promo.minOrderAmount} FCFA.`);
    }
    if (promo.usageLimit != null) {
      const used = await tx.promotionRedemption.count({ where: { promotionId: promo.id } });
      if (used >= promo.usageLimit) throw invalid('il a atteint son nombre maximal d’utilisations.');
    }
    if (promo.perUserLimit != null) {
      const usedByUser = await tx.promotionRedemption.count({ where: { promotionId: promo.id, userId: ctx.userId } });
      if (usedByUser >= promo.perUserLimit) throw invalid('vous l’avez déjà utilisé.');
    }
    if (promo.firstOrderOnly) {
      const previous = await tx.order.count({
        where: { clientId: ctx.userId, status: { notIn: [OrderStatus.CANCELLED] } },
      });
      if (previous > 0) throw invalid('réservé à la première commande.');
    }
    return { promotion: promo, discount: computeDiscount(promo, ctx.deliveryFee) };
  }

  // ------------------------------------------------------------------ administration

  list() {
    return this.prisma.promotion.findMany({
      orderBy: { createdAt: 'desc' },
      include: { city: { select: { id: true, name: true } }, _count: { select: { redemptions: true } } },
    });
  }

  async create(dto: CreatePromotionDto, actorId: string) {
    this.assertConsistent(dto);
    try {
      const promo = await this.prisma.promotion.create({ data: { ...dto, code: dto.code?.trim().toUpperCase() } });
      await this.audit.log({ actorId, action: 'promotion.create', entityType: 'Promotion', entityId: promo.id, after: promo });
      return promo;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Ce code promo existe déjà.');
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdatePromotionDto, actorId: string) {
    const before = await this.prisma.promotion.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Promotion introuvable.');
    this.assertConsistent({ ...before, ...dto } as Promotion);
    const promo = await this.prisma.promotion.update({
      where: { id },
      data: { ...dto, code: dto.code === undefined ? undefined : dto.code.trim().toUpperCase() },
    });
    await this.audit.log({ actorId, action: 'promotion.update', entityType: 'Promotion', entityId: id, before, after: promo });
    return promo;
  }

  private assertConsistent(p: { type: PromotionType; value: number; startsAt?: Date; endsAt?: Date | null }) {
    if (p.type === PromotionType.PERCENT && (p.value <= 0 || p.value > 100)) {
      throw new BadRequestException('Un pourcentage doit être compris entre 1 et 100.');
    }
    if (p.type === PromotionType.FIXED && p.value <= 0) throw new BadRequestException('Le montant de la remise doit être positif.');
    if (p.startsAt && p.endsAt && p.endsAt <= p.startsAt) {
      throw new BadRequestException('La date de fin doit être postérieure à la date de début.');
    }
  }
}
