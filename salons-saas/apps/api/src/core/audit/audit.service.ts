import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DbService } from '../db/db.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  salonId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  /** Par défaut : utilisateur du contexte courant. */
  actorUserId?: string | null;
}

/**
 * Journal d'audit en ajout seul. Écrit dans la transaction courante : si l'action échoue,
 * sa trace disparaît avec elle. tenant_id = tenant du contexte (null = événement plateforme).
 */
@Injectable()
export class AuditService {
  constructor(private readonly db: DbService) {}

  async log(entry: AuditEntry): Promise<void> {
    const meta = this.db.meta;
    // createMany = INSERT sans RETURNING : un événement plateforme (tenant NULL) est
    // insérable mais pas relisible par l'API (politique RLS platform_audit_insert).
    await this.db.tx.auditLog.createMany({
      data: {
        tenantId: this.db.tenantId,
        actorUserId: entry.actorUserId === undefined ? this.db.userId : entry.actorUserId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        salonId: entry.salonId ?? null,
        before: entry.before,
        after: entry.after,
        ipAddress: meta.ipAddress ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });
  }
}
