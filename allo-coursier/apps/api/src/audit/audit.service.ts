import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const SENSITIVE_KEYS = new Set(['secretHash', 'refreshTokenHash', 'deliveryCode', 'trackingToken', 'codeHash']);

function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  return JSON.parse(
    JSON.stringify(value, (key, v) => (SENSITIVE_KEYS.has(key) ? undefined : v)),
  ) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /** Enregistre une action ; un échec d'écriture du journal ne bloque jamais l'action métier. */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          before: sanitize(entry.before),
          after: sanitize(entry.after),
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Échec d'écriture du journal d'audit (${entry.action})`, err as Error);
    }
  }
}
