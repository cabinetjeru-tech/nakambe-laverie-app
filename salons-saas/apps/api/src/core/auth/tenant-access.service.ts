import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { ALL_PERMISSION_CODES, filterByFeatures, OWNER_ROLE_CODE } from '../permissions/catalog';

export interface TenantAccess {
  tenantId: string;
  membershipId: string;
  permissions: string[];
  allSalons: boolean;
  salonIds: string[];
  permissionsVersion: number;
  isOwner: boolean;
  features: Set<string>;
}

/**
 * Calcule les droits effectifs d'un utilisateur dans un tenant :
 *   permissions des rôles ∩ fonctionnalités de l'offre (+ dérogations) ; périmètre salons.
 * Doit être appelé avec le contexte du tenant concerné (DbService.setContext).
 */
@Injectable()
export class TenantAccessService {
  constructor(private readonly db: DbService) {}

  async build(userId: string, tenantId: string): Promise<TenantAccess | null> {
    if (this.db.tenantId !== tenantId) await this.db.setContext({ tenantId, userId });
    const tx = this.db.tx;

    const membership = await tx.membership.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: {
        id: true,
        allSalons: true,
        permissionsVersion: true,
        salons: { select: { salonId: true } },
        roles: {
          select: { role: { select: { code: true, isSystem: true, permissions: { select: { permissionCode: true } } } } },
        },
      },
    });
    if (!membership) return null;

    const features = await this.features(tenantId);
    const isOwner = membership.roles.some((r) => r.role.isSystem && r.role.code === OWNER_ROLE_CODE);
    const codes = isOwner
      ? ALL_PERMISSION_CODES
      : new Set(membership.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionCode)));

    return {
      tenantId,
      membershipId: membership.id,
      permissions: filterByFeatures(codes, features),
      allSalons: isOwner || membership.allSalons,
      salonIds: membership.salons.map((s) => s.salonId).sort(),
      permissionsVersion: membership.permissionsVersion,
      isOwner,
      features,
    };
  }

  /** Fonctionnalités de l'offre du tenant, corrigées par les dérogations en cours. */
  async features(tenantId: string): Promise<Set<string>> {
    const tenant = await this.db.tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: {
        plan: { select: { features: { select: { featureCode: true } } } },
        featureOverrides: { select: { featureCode: true, enabled: true, expiresAt: true } },
      },
    });
    const features = new Set(tenant.plan.features.map((f) => f.featureCode));
    const now = new Date();
    for (const override of tenant.featureOverrides) {
      if (override.expiresAt && override.expiresAt <= now) continue;
      if (override.enabled) features.add(override.featureCode);
      else features.delete(override.featureCode);
    }
    return features;
  }
}
