import { z } from "zod";
import { accepteCreditPass, normaliserCode, nouvelleTransaction, prixApresCredit, prixRemise } from "@/lib/abonnement";
import { CONTACT } from "@/lib/contact";
import { compteCourant, creditPass, formules, verifierPromo } from "@/lib/comptes";
import { causeReseau, initialiserPaiement, PaiementError, paiementDisponible } from "@/lib/paiement/cinetpay";
import { journaliserErreur } from "@/lib/journal";
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

  const parsed = z.object({ formule: z.string().max(40), promo: z.string().max(30).optional() }).safeParse(await req.json().catch(() => null));
  const formule = parsed.success ? (await formules()).find((f) => f.id === parsed.data.formule) : undefined;
  if (!formule) return Response.json({ error: "Formule inconnue." }, { status: 400 });

  // Code promo : vérifié côté serveur, le prix envoyé à CinetPay est recalculé ici.
  let montant = formule.prix_fcfa;
  let codePromo: string | null = null;
  if (parsed.data?.promo?.trim()) {
    const code = normaliserCode(parsed.data.promo);
    const v = code ? await verifierPromo(code, compte.profil.id) : { erreur: "Code promo invalide." };
    if ("erreur" in v) return Response.json({ error: v.erreur }, { status: 400 });
    montant = prixRemise(formule.prix_fcfa, v.promo.remise_pct);
    codePromo = v.promo.code;
  }

  // Pass 24 h payés depuis moins de 7 jours : déduits du prix de l'abonnement annuel.
  let credit = 0;
  let passes: string[] = [];
  if (accepteCreditPass(formule.duree_jours)) {
    const c = await creditPass(compte.profil.id);
    if (c.montant > 0) {
      const apres = prixApresCredit(montant, c.montant);
      credit = montant - apres;
      montant = apres;
      passes = c.passes;
    }
  }

  const transactionId = nouvelleTransaction();
  const db = adminClient();
  const { error } = await db.from("paiements").insert({
    utilisateur_id: compte.profil.id,
    formule_id: formule.id,
    montant_fcfa: montant,
    prix_initial_fcfa: formule.prix_fcfa,
    code_promo: codePromo,
    credit_pass_fcfa: credit,
    passes_deduits: passes.length ? passes : null,
    transaction_id: transactionId,
  });
  if (error) return Response.json({ error: "Paiement impossible pour le moment." }, { status: 500 });

  const base = baseUrl(req);
  try {
    const url = await initialiserPaiement({
      transactionId,
      montant,
      description: `PEDAGOGUE.IA ${formule.libelle}`,
      notifyUrl: `${base}/api/paiement/notification`,
      returnUrl: `${base}/?paiement=${transactionId}`,
      client: { email: compte.profil.email, nom: compte.profil.nom, telephone: compte.profil.telephone, ville: compte.profil.ville },
    });
    return Response.json({ url, transactionId });
  } catch (e) {
    await db.from("paiements").update({ statut: "echoue", detail: { erreur: causeReseau(e) } }).eq("transaction_id", transactionId);
    console.error("[paiement]", causeReseau(e));
    await journaliserErreur("paiement", causeReseau(e), compte.profil.id);
    const message = e instanceof PaiementError ? "Le service de paiement a refusé la demande. Réessayez plus tard." : "Service de paiement injoignable. Réessayez plus tard.";
    return Response.json({ error: message }, { status: 502 });
  }
}
