import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

const FORMATS: Record<string, { prefix: string; yearly: boolean; pad: number }> = {
  SALE: { prefix: 'V', yearly: true, pad: 6 },
  CLIENT: { prefix: 'C', yearly: false, pad: 5 },
};

/**
 * Numérotation continue par tenant (et par année pour les pièces comptables).
 * L'incrément se fait par UPSERT dans la transaction courante : la ligne est verrouillée
 * jusqu'au COMMIT, deux ventes simultanées ne peuvent pas obtenir le même numéro, et un
 * échec annule aussi l'incrément (pas de trou).
 */
@Injectable()
export class SequenceService {
  constructor(private readonly db: DbService) {}

  async next(docType: keyof typeof FORMATS, now = new Date()): Promise<string> {
    const format = FORMATS[docType];
    const year = format.yearly ? now.getUTCFullYear() : 0;
    const tenantId = this.db.tenantId!;
    const row = await this.db.tx.documentSequence.upsert({
      where: { tenantId_docType_year: { tenantId, docType, year } },
      create: { tenantId, docType, year, value: 1 },
      update: { value: { increment: 1 } },
      select: { value: true },
    });
    const number = String(row.value).padStart(format.pad, '0');
    return format.yearly ? `${format.prefix}-${year}-${number}` : `${format.prefix}-${number}`;
  }
}
