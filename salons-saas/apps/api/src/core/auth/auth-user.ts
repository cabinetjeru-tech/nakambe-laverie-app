/** Utilisateur authentifié, reconstruit à partir du jeton d'accès. */
export interface AuthUser {
  userId: string;
  /** Famille de sessions (révocable) à laquelle appartient le jeton. */
  sessionId: string;
  /** Tenant actif ; null tant que l'utilisateur n'a pas choisi d'entreprise (ou s'il est client). */
  tenantId: string | null;
  membershipId: string | null;
  permissions: string[];
  /** Périmètre salons : true = tous les salons du tenant. */
  allSalons: boolean;
  salonIds: string[];
  /** Version des permissions de l'adhésion au moment de l'émission du jeton. */
  permissionsVersion: number;
}

/** Contenu du JWT (noms courts pour limiter sa taille). */
export interface AccessTokenPayload {
  sub: string;
  sid: string;
  tid: string | null;
  mid: string | null;
  perms: string[];
  sal: '*' | string[];
  pv: number;
}

export function toAuthUser(payload: AccessTokenPayload): AuthUser {
  return {
    userId: payload.sub,
    sessionId: payload.sid,
    tenantId: payload.tid,
    membershipId: payload.mid,
    permissions: payload.perms ?? [],
    allSalons: payload.sal === '*',
    salonIds: payload.sal === '*' ? [] : payload.sal ?? [],
    permissionsVersion: payload.pv ?? 0,
  };
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
  }
}
