/** Utilisateur authentifié, tel que porté par le jeton d'accès. */
export interface AuthUser {
  id: string;
  roles: string[];
  permissions: string[];
}
