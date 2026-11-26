import { BadRequestException, Global, Injectable, Module } from '@nestjs/common';
import { CashMovementSource, CashMovementType, StockMovementType } from '@prisma/client';
import { computeCommission } from '@dread-royal/shared';
import { Tx } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.module';

/** Caisse espèces : tout mouvement d'espèces passe par la session ouverte. */
@Injectable()
export class CashEngine {
  async openSession(tx: Tx) {
    return tx.cashSession.findFirst({ where: { status: 'OPEN' }, orderBy: { openedAt: 'desc' } });
  }

  async record(tx: Tx, m: { type: CashMovementType; source: CashMovementSource; amount: number; label: string; referenceId?: string; userId: string }) {
    if (m.amount <= 0) throw new BadRequestException('Montant de caisse invalide');
    // Verrou : sérialise les mouvements de caisse (cohérence du solde théorique)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cash-session'))`;
    const session = await this.openSession(tx);
    if (!session) throw new BadRequestException("La caisse est fermée : ouvrez une session de caisse avant toute opération en espèces");
    if (m.type === 'OUT') {
      const expected = await this.expected(tx, session.id, session.openingAmount);
      if (m.amount > expected) throw new BadRequestException(`Espèces insuffisantes en caisse (solde théorique : ${expected} FCFA)`);
    }
    return tx.cashMovement.create({ data: { ...m, sessionId: session.id } });
  }

  async expected(tx: Tx, sessionId: string, openingAmount: number) {
    const g = await tx.cashMovement.groupBy({ by: ['type'], where: { sessionId }, _sum: { amount: true } });
    const inn = g.find((x) => x.type === 'IN')?._sum.amount ?? 0;
    const out = g.find((x) => x.type === 'OUT')?._sum.amount ?? 0;
    return openingAmount + inn - out;
  }
}

/** Mouvements de stock atomiques (jamais de stock négatif). */
@Injectable()
export class StockEngine {
  async move(tx: Tx, m: { productId: string; type: StockMovementType; quantity: number; unitCost?: number; reason?: string; saleId?: string; purchaseId?: string; inventoryId?: string; userId: string }) {
    if (m.quantity === 0) return null;
    // Mise à jour conditionnelle : échoue si le stock deviendrait négatif
    const rows = await tx.$queryRaw<{ quantity: number; purchasePrice: number; name: string }[]>`
      UPDATE "Product" SET "quantity" = "quantity" + ${m.quantity}, "updatedAt" = now()
      WHERE "id" = ${m.productId} AND "quantity" + ${m.quantity} >= 0
      RETURNING "quantity", "purchasePrice", "name"`;
    if (rows.length === 0) {
      const p = await tx.product.findUnique({ where: { id: m.productId } });
      if (!p) throw new BadRequestException('Produit introuvable');
      throw new BadRequestException(`Stock insuffisant pour « ${p.name} » (disponible : ${p.quantity} ${p.unit})`);
    }
    const after = rows[0].quantity;
    return tx.stockMovement.create({
      data: {
        productId: m.productId, type: m.type, quantity: m.quantity, quantityBefore: after - m.quantity, quantityAfter: after,
        unitCost: m.unitCost ?? rows[0].purchasePrice, reason: m.reason, saleId: m.saleId, purchaseId: m.purchaseId, inventoryId: m.inventoryId, userId: m.userId,
      },
    });
  }
}

/**
 * Commissions : créées à la vente (statut PENDING), deviennent DUE quand la vente est soldée
 * (« prestations effectivement réalisées et payées »), annulées ou régularisées si la vente est annulée.
 * Base de calcul : montant de la ligne après remise de ligne, au prorata de la remise globale.
 */
@Injectable()
export class CommissionEngine {
  async createForSale(tx: Tx, saleId: string) {
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId }, include: { items: { include: { service: true, staff: true } } } });
    const ratio = sale.subtotal > 0 ? sale.total / sale.subtotal : 0;
    for (const it of sale.items) {
      if (it.type !== 'SERVICE' || !it.staff || !it.service) continue;
      const base = Math.round(it.total * ratio);
      let type: 'PERCENT' | 'FIXED' | 'NONE';
      let value: number;
      switch (it.staff.commissionMode) {
        case 'NONE': continue;
        case 'PERCENT': type = 'PERCENT'; value = it.staff.commissionRate; break;
        case 'FIXED': type = 'FIXED'; value = it.staff.commissionFixed; break;
        default: type = it.service.commissionType; value = it.service.commissionValue;
      }
      const amount = computeCommission(base, type, value, it.quantity);
      if (amount <= 0) continue;
      await tx.commission.create({
        data: { saleItemId: it.id, staffId: it.staff.id, baseAmount: base, amount, rule: type === 'PERCENT' ? `${value} %` : `${value} FCFA fixe`, status: 'PENDING' },
      });
    }
  }

  async onSalePaid(tx: Tx, saleId: string) {
    await tx.commission.updateMany({ where: { saleItem: { saleId }, status: 'PENDING' }, data: { status: 'DUE', earnedAt: new Date() } });
  }

  async onSaleCancelled(tx: Tx, saleId: string) {
    await tx.commission.updateMany({ where: { saleItem: { saleId }, status: { in: ['PENDING', 'DUE'] }, isReversal: false }, data: { status: 'CANCELLED' } });
    // Commissions déjà réglées : régularisation négative déduite du prochain règlement
    const paid = await tx.commission.findMany({ where: { saleItem: { saleId }, status: 'PAID', isReversal: false } });
    for (const c of paid) {
      await tx.commission.create({ data: { saleItemId: c.saleItemId, staffId: c.staffId, baseAmount: -c.baseAmount, amount: -c.amount, rule: `Régularisation (annulation)`, status: 'DUE', earnedAt: new Date(), isReversal: true } });
    }
  }
}

/** Fidélité : gain de points à la vente soldée, utilisation en réduction, annulation. */
@Injectable()
export class LoyaltyEngine {
  constructor(private settings: SettingsService) {}

  async rules() {
    return this.settings.get('loyalty');
  }

  /** Valeur de la réduction pour un nombre de points, avec contrôles. */
  async redeemValue(tx: Tx, clientId: string | null | undefined, points: number, base: number) {
    if (!points) return 0;
    const r = await this.rules();
    if (!r.enabled) throw new BadRequestException('Le programme de fidélité est désactivé');
    if (!clientId) throw new BadRequestException('Sélectionnez le client pour utiliser ses points');
    const client = await tx.client.findUniqueOrThrow({ where: { id: clientId } });
    if (points < r.minRedeemPoints) throw new BadRequestException(`Minimum ${r.minRedeemPoints} points pour une récompense`);
    if (points > client.loyaltyPoints) throw new BadRequestException(`Solde de points insuffisant (${client.loyaltyPoints} points)`);
    const value = points * r.pointValue;
    const max = Math.floor((base * r.maxRedeemPercent) / 100);
    if (value > max) throw new BadRequestException(`La fidélité peut couvrir au maximum ${r.maxRedeemPercent} % de la vente (${max} FCFA)`);
    return value;
  }

  async add(tx: Tx, clientId: string, type: 'EARN' | 'REDEEM' | 'ADJUST' | 'CANCEL', points: number, reason: string, saleId?: string, userId?: string) {
    if (points === 0) return;
    const c = await tx.client.update({ where: { id: clientId }, data: { loyaltyPoints: { increment: points } } });
    if (c.loyaltyPoints < 0) throw new BadRequestException('Le solde de points ne peut pas devenir négatif');
    await tx.loyaltyTransaction.create({ data: { clientId, type, points, reason, saleId, userId } });
  }

  async earnForSale(tx: Tx, saleId: string, userId: string) {
    const r = await this.rules();
    const sale = await tx.sale.findUniqueOrThrow({ where: { id: saleId } });
    if (!r.enabled || !sale.clientId) return;
    const already = await tx.loyaltyTransaction.findFirst({ where: { saleId, type: 'EARN' } });
    if (already) return;
    const pts = Math.floor(sale.total / r.amountPerPoint);
    await this.add(tx, sale.clientId, 'EARN', pts, `Achat ${sale.number}`, saleId, userId);
  }

  async reverseForSale(tx: Tx, saleId: string, userId: string) {
    const txs = await tx.loyaltyTransaction.findMany({ where: { saleId, type: { in: ['EARN', 'REDEEM'] } } });
    for (const t of txs) {
      // Les points gagnés sont retirés (dans la limite du solde), les points utilisés sont rendus
      let pts = -t.points;
      if (pts < 0) {
        const c = await tx.client.findUniqueOrThrow({ where: { id: t.clientId } });
        pts = Math.max(pts, -c.loyaltyPoints);
      }
      await this.add(tx, t.clientId, 'CANCEL', pts, `Annulation de la vente`, saleId, userId);
    }
  }
}

@Global()
@Module({ providers: [CashEngine, StockEngine, CommissionEngine, LoyaltyEngine], exports: [CashEngine, StockEngine, CommissionEngine, LoyaltyEngine] })
export class CoreModule {}
