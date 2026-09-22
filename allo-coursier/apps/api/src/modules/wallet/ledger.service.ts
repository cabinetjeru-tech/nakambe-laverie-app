import { BadRequestException, Injectable } from '@nestjs/common';
import { LedgerTransactionType, Prisma, WalletKind } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

export interface LedgerLine {
  walletId: string;
  /** Positif = la plateforme doit davantage à ce compte ; négatif = le compte doit davantage. */
  amount: number;
  /** Refuse l'écriture si le solde deviendrait négatif (ex. paiement par portefeuille client). */
  mustStayPositive?: boolean;
}

export interface LedgerPosting {
  type: LedgerTransactionType;
  description: string;
  orderId?: string;
  paymentId?: string;
  createdById?: string;
  lines: LedgerLine[];
}

/**
 * Registre comptable en partie double : chaque opération est une transaction dont les écritures
 * s'annulent (somme = 0). Le solde d'un portefeuille est la somme de ses écritures (mis en cache).
 *
 * Comptes système :
 *  - PLATFORM_REVENUE : compte de la plateforme (commissions + argent des commandes prépayées en attente) ;
 *  - CASH_CLEARING : « flux externes » — contrepartie de l'argent qui entre ou sort réellement
 *    (Mobile Money reçu, espèces versées par les livreurs, retraits payés).
 *
 * Comptes des personnes :
 *  - CLIENT : crédit disponible du client ;
 *  - DRIVER : ce que la plateforme doit au livreur (positif) ou ce qu'il doit, espèces encaissées (négatif).
 */
@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  async systemWallet(kind: 'PLATFORM_REVENUE' | 'CASH_CLEARING', tx: Tx = this.prisma) {
    const existing = await tx.wallet.findFirst({ where: { kind, userId: null, merchantId: null } });
    if (existing) return existing;
    return tx.wallet.create({ data: { kind } });
  }

  async userWallet(kind: 'CLIENT' | 'DRIVER', userId: string, tx: Tx = this.prisma) {
    return tx.wallet.upsert({
      where: { kind_userId: { kind, userId } },
      create: { kind, userId },
      update: {},
    });
  }

  async merchantWallet(merchantId: string, tx: Tx = this.prisma) {
    return tx.wallet.upsert({
      where: { kind_merchantId: { kind: 'MERCHANT', merchantId } },
      create: { kind: 'MERCHANT', merchantId },
      update: {},
    });
  }

  async post(posting: LedgerPosting, tx: Tx) {
    const lines = posting.lines.filter((l) => l.amount !== 0);
    const total = lines.reduce((sum, l) => sum + l.amount, 0);
    if (total !== 0) throw new Error(`Écriture déséquilibrée (${total}) : ${posting.description}`);
    if (lines.some((l) => !Number.isInteger(l.amount))) throw new Error('Les montants doivent être entiers.');
    if (lines.length === 0) return null;

    const transaction = await tx.ledgerTransaction.create({
      data: {
        type: posting.type,
        description: posting.description,
        orderId: posting.orderId,
        paymentId: posting.paymentId,
        createdById: posting.createdById,
      },
    });
    for (const line of lines) {
      if (line.mustStayPositive && line.amount < 0) {
        const updated = await tx.wallet.updateMany({
          where: { id: line.walletId, balance: { gte: -line.amount } },
          data: { balance: { increment: line.amount } },
        });
        if (updated.count === 0) throw new BadRequestException('Solde du portefeuille insuffisant.');
      } else {
        await tx.wallet.update({ where: { id: line.walletId }, data: { balance: { increment: line.amount } } });
      }
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: line.walletId }, select: { balance: true } });
      await tx.ledgerEntry.create({
        data: { transactionId: transaction.id, walletId: line.walletId, amount: line.amount, balanceAfter: wallet.balance },
      });
    }
    return transaction;
  }

  async entries(walletId: string, take = 50, skip = 0) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.ledgerEntry.findMany({
        where: { walletId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: { transaction: { select: { type: true, description: true, orderId: true, createdAt: true } } },
      }),
      this.prisma.ledgerEntry.count({ where: { walletId } }),
    ]);
    return { items, total };
  }

  /** Dette espèces d'un livreur (montant qu'il doit reverser), 0 s'il n'en a pas. */
  async driverCashDebt(driverId: string, tx: Tx = this.prisma): Promise<number> {
    const wallet = await tx.wallet.findUnique({ where: { kind_userId: { kind: WalletKind.DRIVER, userId: driverId } } });
    return Math.max(0, -(wallet?.balance ?? 0));
  }
}
