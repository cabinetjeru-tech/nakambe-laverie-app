import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService, Tx } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
}

function clean(v: unknown) {
  if (v === undefined) return undefined;
  // Ne jamais journaliser de mot de passe ou de hash
  return JSON.parse(
    JSON.stringify(v, (k, val) => (['passwordHash', 'password', 'tokenHash', 'newPassword'].includes(k) ? '***' : val)),
  );
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}
  async log(e: AuditEntry, tx?: Tx) {
    const db = tx ?? this.prisma;
    await db.auditLog.create({
      data: {
        userId: e.userId ?? null,
        action: e.action,
        entity: e.entity,
        entityId: e.entityId ?? null,
        summary: e.summary,
        before: clean(e.before) as any,
        after: clean(e.after) as any,
        ip: e.ip,
      },
    });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditCoreModule {}
