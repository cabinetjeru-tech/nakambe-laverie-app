import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Comptes enseignants (Supabase). Actifs quand les trois variables sont renseignées :
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (navigateur) et SUPABASE_SECRET_KEY (serveur).
 * Sans elles, l'application garde l'accès par code partagé (KIBARU_ACCESS_CODE).
 */

export function accountsEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SECRET_KEY);
}

/** Client lié à la session de l'enseignant (cookies) : sert uniquement à savoir qui appelle. */
export async function sessionClient(): Promise<SupabaseClient> {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Appelé depuis un rendu serveur : les cookies seront rafraîchis par la prochaine route.
        }
      },
    },
  });
}

let admin: SupabaseClient | null = null;

/** Client serveur à clé secrète : toutes les lectures et écritures de l'application passent par lui. */
export function adminClient(): SupabaseClient {
  admin ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}
