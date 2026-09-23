import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { LedgerAccount } from '@prisma/client';
import { DbService } from '../db/db.service';

export interface LedgerLine {
  account: LedgerAccount;
  debit?: bigint;
  credit?: bigint;
}

export interface LedgerLinks {
  salonId: string;
  currency: string;
  saleId?: string;
  paymentId?: string;
  refundId?: string;
  cashSessionId?: string;
  cashMovementId?: string;
  expenseId?: string;
  description?: string;
}

/**
 * Registre en partie double. Chaque opération d'argent écrit un groupe de lignes dont les
 * débits égalent les crédits ; PostgreSQL le vérifie au COMMIT (trigger différé) et refuse
 * toute écriture déséquilibrée. Le registre est en ajout seul : une correction est une
 * nouvelle écriture inverse (`reverse`).
 */
@Injectable()
export class LedgerService {
  constructor(private readonly db: DbService) {}

  async post(lines: LedgerLine[], links: LedgerLinks): Promise<string> {
    const group = randomUUID();
    const rows = lines
      .map((line) => ({ ...line, debit: line.debit ?? 0n, credit: line.credit ?? 0n }))
      .filter((line) => line.debit !== 0n || line.credit !== 0n)
      // Une ligne porte soit un débit soit un crédit, jamais les deux ni un montant négatif.
      .map((line) => {
        const net = line.debit - line.credit;
        return { account: line.account, debit: net > 0n ? net : 0n, credit: net < 0n ? -net : 0n };
      })
      .filter((line) => line.debit !== 0n || line.credit !== 0n);
    if (rows.length === 0) return group;

    const { description, ...refs } = links;
    await this.db.tx.ledgerEntry.createMany({
      data: rows.map((row) => ({
        tenantId: this.db.tenantId!,
        transactionGroup: group,
        description: description ?? null,
        ...refs,
        ...row,
      })),
    });
    return group;
  }

  /** Écriture inverse (annulation) : chaque débit devient crédit et inversement. */
  reverse(lines: LedgerLine[]): LedgerLine[] {
    return lines.map((line) => ({ account: line.account, debit: line.credit ?? 0n, credit: line.debit ?? 0n }));
  }
}
