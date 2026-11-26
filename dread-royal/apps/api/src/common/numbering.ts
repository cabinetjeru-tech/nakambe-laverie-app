import { Tx } from '../prisma/prisma.service';

/**
 * Numéro de document unique et séquentiel par préfixe et par année.
 * L'incrément est atomique (UPSERT … RETURNING) et participe à la transaction en cours.
 */
export async function nextNumber(tx: Tx, prefix: string, pad = 6, date = new Date()): Promise<string> {
  const year = date.getUTCFullYear();
  const key = `${prefix}-${year}`;
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${prefix}-${year}-${String(rows[0].value).padStart(pad, '0')}`;
}

/** Code sans année (clients, personnel). */
export async function nextCode(tx: Tx, prefix: string, pad = 6): Promise<string> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value") VALUES (${prefix}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "Counter"."value" + 1
    RETURNING "value"`;
  return `${prefix}-${String(rows[0].value).padStart(pad, '0')}`;
}
