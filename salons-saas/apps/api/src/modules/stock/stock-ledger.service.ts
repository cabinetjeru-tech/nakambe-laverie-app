import { Injectable } from '@nestjs/common';
import { Prisma, StockMovementType } from '@prisma/client';
import { DbService } from '../../core/db/db.service';

export interface MovementInput {
  salonId: string;
  productId: string;
  type: StockMovementType;
  /** Quantité signée : positive = entrée, négative = sortie. */
  quantity: Prisma.Decimal | number;
  unitCost?: bigint | null;
  saleId?: string;
  transferId?: string;
  reason?: string | null;
  createdBy?: string | null;
}

/**
 * Seule porte d'entrée pour modifier un stock : écrit le mouvement (journal en ajout seul)
 * et met à jour la quantité du salon, ligne verrouillée (FOR UPDATE) le temps de la
 * transaction pour que deux ventes simultanées ne se marchent pas dessus.
 * Le coût moyen pondéré est recalculé à chaque réception.
 */
@Injectable()
export class StockLedgerService {
  constructor(private readonly db: DbService) {}

  async apply(input: MovementInput): Promise<{ quantity: Prisma.Decimal; averageCost: bigint }> {
    const tx = this.db.tx;
    const tenantId = this.db.tenantId!;
    const delta = new Prisma.Decimal(input.quantity);

    const [current] = await tx.$queryRaw<{ quantity: Prisma.Decimal; average_cost: bigint }[]>`
      SELECT quantity, average_cost FROM product_stocks
      WHERE tenant_id = ${tenantId}::uuid AND product_id = ${input.productId}::uuid AND salon_id = ${input.salonId}::uuid
      FOR UPDATE`;
    const before = current ? new Prisma.Decimal(current.quantity) : new Prisma.Decimal(0);
    const beforeCost = current ? BigInt(current.average_cost) : 0n;
    const after = before.plus(delta);

    let averageCost = beforeCost;
    if (input.type === 'PURCHASE_RECEIPT' || input.type === 'TRANSFER_IN') {
      const cost = input.unitCost ?? beforeCost;
      averageCost = before.lte(0)
        ? cost
        : BigInt(
            before
              .times(beforeCost.toString())
              .plus(delta.times(cost.toString()))
              .dividedBy(after)
              .toDecimalPlaces(0)
              .toString(),
          );
    }

    await tx.stockMovement.createMany({
      data: [
        {
          tenantId,
          salonId: input.salonId,
          productId: input.productId,
          type: input.type,
          quantity: delta,
          unitCost: input.unitCost ?? beforeCost,
          saleId: input.saleId ?? null,
          transferId: input.transferId ?? null,
          reason: input.reason ?? null,
          createdBy: input.createdBy ?? this.db.userId,
        },
      ],
    });
    await tx.productStock.upsert({
      where: { tenantId_productId_salonId: { tenantId, productId: input.productId, salonId: input.salonId } },
      create: { tenantId, productId: input.productId, salonId: input.salonId, quantity: after, averageCost },
      update: { quantity: after, averageCost, version: { increment: 1 } },
    });
    return { quantity: after, averageCost };
  }
}
