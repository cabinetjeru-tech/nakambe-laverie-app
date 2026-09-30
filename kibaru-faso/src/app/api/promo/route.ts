import { normaliserCode, prixRemise } from "@/lib/abonnement";
import { compteCourant, formules, verifierPromo } from "@/lib/comptes";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { accountsEnabled } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aperçu d'un code promo : remise et nouveaux prix, avant le paiement. */
export async function GET(req: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Comptes non configurés." }, { status: 404 });
  const rl = rateLimit(`promo:${clientIp(req)}`, 20, 10 * 60_000);
  if (!rl.ok) return Response.json({ error: "Trop d'essais. Réessayez dans quelques minutes." }, { status: 429 });
  const compte = await compteCourant();
  if (!compte) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  const code = normaliserCode(new URL(req.url).searchParams.get("code"));
  if (!code) return Response.json({ error: "Code promo invalide." }, { status: 400 });
  const v = await verifierPromo(code, compte.profil.id);
  if ("erreur" in v) return Response.json({ error: v.erreur }, { status: 400 });
  const prix = Object.fromEntries((await formules()).map((f) => [f.id, prixRemise(f.prix_fcfa, v.promo.remise_pct)]));
  return Response.json({ code: v.promo.code, remise_pct: v.promo.remise_pct, description: v.promo.description, prix });
}
