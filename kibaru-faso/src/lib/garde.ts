import "server-only";
import { hasAccess } from "./access";
import { utilisateurCourant } from "./comptes";
import { accountsEnabled } from "./supabase/server";

/** Accès aux routes secondaires (catalogue, import de documents) : enseignant connecté, ou code d'accès partagé. */
export async function connecte(req: Request): Promise<boolean> {
  if (accountsEnabled()) return !!(await utilisateurCourant().catch(() => null));
  return hasAccess(req);
}
