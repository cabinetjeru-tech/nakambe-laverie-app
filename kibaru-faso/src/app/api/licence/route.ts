import { z } from "zod";
import { codeLicenceValide } from "@/lib/abonnement";
import { compteCourant, rejoindreLicence } from "@/lib/comptes";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { accountsEnabled } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Un enseignant active sa place dans la licence de son établissement avec le code reçu. */
export async function POST(req: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Comptes non configurés." }, { status: 404 });
  const rl = rateLimit(`licence:${clientIp(req)}`, 10, 10 * 60_000);
  if (!rl.ok) return Response.json({ error: "Trop d'essais. Réessayez dans quelques minutes." }, { status: 429 });
  const compte = await compteCourant();
  if (!compte) return Response.json({ error: "Connectez-vous d'abord à votre espace enseignant." }, { status: 401 });
  if (compte.profil.suspendu) return Response.json({ error: "Votre compte est suspendu." }, { status: 403 });
  const parsed = z.object({ code: z.string().max(20) }).safeParse(await req.json().catch(() => null));
  const code = codeLicenceValide(parsed.success ? parsed.data.code : null);
  if (!code) return Response.json({ error: "Code de licence invalide (8 caractères)." }, { status: 400 });
  const r = await rejoindreLicence(code, compte.profil.id);
  if ("erreur" in r) return Response.json({ error: r.erreur }, { status: 400 });
  return Response.json({ ok: true, message: `Bienvenue ! Votre accès offert par ${r.nom} est actif jusqu'au ${r.fin.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}.` });
}
