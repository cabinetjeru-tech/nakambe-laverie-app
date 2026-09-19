import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Génère des numéros de documents séquentiels et lisibles (NK-2026-000001).
 * Utilise une transaction pour éviter les doublons en cas d'accès concurrent.
 */
@Injectable()
export class NumberingService {
  constructor(private prisma: PrismaService) {}

  async next(prefix: string): Promise<string> {
    const year = new Date().getFullYear();
    const key = `${prefix}_${year}`;

    const sequence = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sequence.upsert({
        where: { key },
        create: { key, value: 1 },
        update: { value: { increment: 1 } },
      });
      return existing.value;
    });

    const padded = String(sequence).padStart(6, '0');
    return `NK-${prefix}-${year}-${padded}`;
  }

  /** Numéro de commande : NK-2026-000001 (sans segment de type, comme demandé en §8) */
  async nextOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const key = `order_${year}`;
    const sequence = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sequence.upsert({
        where: { key },
        create: { key, value: 1 },
        update: { value: { increment: 1 } },
      });
      return existing.value;
    });
    const padded = String(sequence).padStart(6, '0');
    return `NK-${year}-${padded}`;
  }

  async nextClientNumber(): Promise<string> {
    const sequence = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sequence.upsert({
        where: { key: 'client' },
        create: { key: 'client', value: 1 },
        update: { value: { increment: 1 } },
      });
      return existing.value;
    });
    return `NK-CLI-${String(sequence).padStart(6, '0')}`;
  }
}
