import { prisma } from "./db";
import { clientIp } from "./request";

/** Journalise une opération administrative. Ne jamais y inclure de secret. */
export async function audit(actorId: string | null, action: string, entity: string, entityId?: string | null, meta?: Record<string, unknown>) {
  let ip: string | undefined;
  try {
    ip = await clientIp();
  } catch {
    ip = undefined;
  }
  await prisma.auditLog.create({
    data: { actorId, action, entity, entityId: entityId ?? null, meta: (meta ?? undefined) as object | undefined, ip },
  });
}
