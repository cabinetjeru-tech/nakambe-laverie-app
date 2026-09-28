import { z } from "zod";
import { nouvelleTransaction } from "@/lib/abonnement";
import { CONTACT } from "@/lib/contact";
import { compteCourant, formules } from "@/lib/comptes";
import { initialiserPaiement, PaiementError, paiementDisponible } from "@/lib/paiement/cinetpay";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { accountsEnabled, adminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Adresse publique de l'application (APP_URL, sinon celle de la requête). */
function baseUrl(req: Request): string {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

/** Démarre un paiement mobile money : renvoie l'adresse de la page de paiement CinetPay. */
export async function POST(req: Request) {
  if (!accountsEnabled() || !paiementDisponible()) return Response.json({ error: `Le paiement en ligne n'est pas encore activé. Contactez ${CONTACT.entreprise} au ${CONTACT.telephone}.` }, { status: 503 });
  const compte = await compteCourant();
  if (!compte) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  if (compte.profil.suspendu) return Response.json({ error: "Votre compte est suspendu." }, { status: 403 });
  const rl = rateLimit(`paiement:${compte.profil.id}:${clientIp(req)}`, 5, 10 * 60_000);
  if (!rl.ok) return Response.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });

  const parsed = z.object({ formule: z.string().max(40) }).safeParse(await req.json().catch(() => null));
  const formule = parsed.success ? (await formules()).find((f) => f.id === parsed.data.formule) : undefined;
  if (!formule) return Response.json({ error: "Formule inconnue." }, { status: 400 });

  const transactionId = nouvelleTransaction();
  const db = adminClient();
  const { error } = await db.from("paiements").insert({
    utilisateur_id: compte.profil.id,
    formule_id: formule.id,
    montant_fcfa: formule.prix_fcfa,
    transaction_id: transactionId,
  });
  if (error) return Response.json({ error: "Paiement impossible pour le moment." }, { status: 500 });

  const base = baseUrl(req);
  try {
    const url = await initialiserPaiement({
      transactionId,
      montant: formule.prix_fcfa,
      description: `PEDAGOGUE.IA ${formule.libelle}`,
      notifyUrl: `${base}/api/paiement/notification`,
      returnUrl: `${base}/?paiement=${transactionId}`,
      client: { email: compte.profil.email, nom: compte.profil.nom, telephone: compte.profil.telephone },
    });
    return Response.json({ url, transactionId });
  } catch (e) {
    await db.from("paiements").update({ statut: "echoue", detail: { erreur: (e as Error).message } }).eq("transaction_id", transactionId);
    console.error("[paiement]", (e as Error).message);
    const message = e instanceof PaiementError ? "Le service de paiement a refusé la demande. Réessayez plus tard." : "Service de paiement injoignable. Réessayez plus tard.";
    return Response.json({ error: message }, { status: 502 });
  }
}
