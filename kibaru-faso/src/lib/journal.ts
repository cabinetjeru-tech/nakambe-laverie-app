import "server-only";
import { accountsEnabled, adminClient } from "./supabase/server";

/** Journal des erreurs techniques, consultable dans /admin (les journaux de l'hébergeur ne sont pas toujours accessibles). */
export async function journaliserErreur(source: string, detail: string, utilisateurId: string | null = null): Promise<void> {
  if (!accountsEnabled()) return;
  await adminClient()
    .from("journal_erreurs")
    .insert({ source, detail: detail.slice(0, 2000), utilisateur_id: utilisateurId })
    .then(
      () => undefined,
      () => undefined,
    );
}
