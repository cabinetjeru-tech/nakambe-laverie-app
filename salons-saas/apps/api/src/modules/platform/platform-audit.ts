import { Prisma } from '@prisma/client';
import { PlatformTx } from '../../core/platform/platform-db.service';

/** Journal des actions de l'équipe plateforme (tenant concerné, ou null pour la plateforme). */
export function platformAudit(
  tx: PlatformTx,
  entry: { tenantId: string | null; actorUserId: string; action: string; entityType: string; entityId?: string | null; after?: Prisma.InputJsonValue },
) {
  return tx.auditLog.create({
    data: {
      tenantId: entry.tenantId,
      actorUserId: entry.actorUserId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      after: entry.after,
    },
  });
}
