import { Prisma } from '@prisma/client';

/**
 * Deuxième couche d'isolation (la première : le tenant vient du jeton ; la troisième : RLS).
 *
 * Sur tous les modèles qui portent `tenantId` :
 * - lectures, mises à jour et suppressions reçoivent `where.tenantId = <tenant courant>` ;
 * - les créations reçoivent `tenantId = <tenant courant>` (refusées s'il en indique un autre) ;
 * - toute requête sans tenant courant est refusée.
 *
 * Seule exception : un utilisateur peut lire SES adhésions et SES fiches client dans tous
 * les tenants (sélection du salon, espace client), à condition que la requête filtre sur
 * son propre userId — ce que la RLS impose aussi côté PostgreSQL.
 */
export interface TenantScopeState {
  tenantId: string | null;
  userId: string | null;
  /** Active temporairement l'exception « mes adhésions / mes fiches » (DbService.asUserAcrossTenants). */
  userScopeRead: boolean;
}

export class TenantScopeViolation extends Error {}

/** Modèles exclus : AuditLog porte un tenantId facultatif, fixé explicitement par AuditService. */
const EXCLUDED_MODELS = new Set(['AuditLog']);

export const TENANT_MODELS: ReadonlySet<string> = new Set(
  Prisma.dmmf.datamodel.models
    .filter((model) => !EXCLUDED_MODELS.has(model.name) && model.fields.some((field) => field.name === 'tenantId'))
    .map((model) => model.name),
);

const USER_SCOPED_MODELS = new Set(['Membership', 'ClientProfile']);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

const READ_OPERATIONS = new Set(['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count']);

type AnyArgs = Record<string, any>;

function scopeWhere(model: string, where: AnyArgs | undefined, tenantId: string): AnyArgs {
  if (where && where.tenantId !== undefined && where.tenantId !== tenantId) {
    throw new TenantScopeViolation(`${model} : filtre tenantId différent du tenant courant`);
  }
  return { ...(where ?? {}), tenantId };
}

function scopeData(model: string, data: AnyArgs, tenantId: string): AnyArgs {
  if (data.tenantId !== undefined && data.tenantId !== tenantId) {
    throw new TenantScopeViolation(`${model} : création dans un autre tenant refusée`);
  }
  // Une création « checked » (avec relation `tenant: { connect }`) n'accepte pas tenantId en scalaire.
  if (data.tenant !== undefined) return data;
  return { ...data, tenantId };
}

export function tenantScopeExtension(getState: () => TenantScopeState | undefined) {
  return Prisma.defineExtension({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) return query(args);

          const state = getState();
          const tenantId = state?.tenantId ?? null;
          const scopedArgs: AnyArgs = { ...((args as AnyArgs) ?? {}) };

          if (!tenantId) {
            const allowed =
              state?.userScopeRead &&
              state.userId &&
              USER_SCOPED_MODELS.has(model) &&
              READ_OPERATIONS.has(operation) &&
              scopedArgs.where?.userId === state.userId;
            if (!allowed) {
              throw new TenantScopeViolation(`${model}.${operation} sans contexte tenant`);
            }
            return query(scopedArgs);
          }

          if (WHERE_OPERATIONS.has(operation)) {
            scopedArgs.where = scopeWhere(model, scopedArgs.where, tenantId);
          }
          switch (operation) {
            case 'create':
              scopedArgs.data = scopeData(model, scopedArgs.data ?? {}, tenantId);
              break;
            case 'createMany':
            case 'createManyAndReturn': {
              const rows = Array.isArray(scopedArgs.data) ? scopedArgs.data : [scopedArgs.data];
              scopedArgs.data = rows.map((row: AnyArgs) => scopeData(model, row, tenantId));
              break;
            }
            case 'upsert':
              scopedArgs.where = scopeWhere(model, scopedArgs.where, tenantId);
              scopedArgs.create = scopeData(model, scopedArgs.create ?? {}, tenantId);
              break;
          }
          return query(scopedArgs);
        },
      },
    },
  });
}
