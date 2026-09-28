import { z } from "zod";
import { compteCourant, traiterPaiement } from "@/lib/comptes";
import { accountsEnabled } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Au retour de la page de paiement : l'enseignant demande l'état de sa transaction (revérifiée chez CinetPay). */
export async function POST(req: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Comptes non configurés." }, { status: 404 });
  const compte = await compteCourant();
  if (!compte) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  const parsed = z.object({ transaction: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Transaction invalide." }, { status: 400 });
  try {
    const r = await traiterPaiement(parsed.data.transaction);
    if (!r.paiement || r.paiement.utilisateur_id !== compte.profil.id) return Response.json({ error: "Transaction introuvable." }, { status: 404 });
    return Response.json({ statut: r.statut });
  } catch (e) {
    console.error("[paiement] vérification", (e as Error).message);
    return Response.json({ error: "Vérification impossible pour le moment. Réessayez dans un instant." }, { status: 502 });
  }
}
