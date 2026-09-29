import "server-only";
import type { CodePromo } from "../abonnement";
import { lienDecouvrir, SITE } from "../campagne";
import { adminClient } from "../supabase/server";
import { emailConfigure, envoyerUneFois } from "./envoi";
import { emailAdminPaiement, emailBienvenue, emailCommission, emailFinEssai, emailPaiement, emailRappelFin } from "./modeles";

/** E-mails automatiques de PÉDAGOGUE.IA. Chaque fonction est silencieuse en cas d'échec (journal serveur uniquement). */

const JOUR = 86_400_000;

export function site(): string {
  return (process.env.APP_URL?.trim() || SITE).replace(/\/$/, "");
}

type ProfilMail = { id: string; email: string; nom: string | null; code_parrainage: string | null; role: string; suspendu: boolean };

async function profil(id: string): Promise<ProfilMail | null> {
  const { data } = await adminClient().from("profils").select("id, email, nom, code_parrainage, role, suspendu").eq("id", id).maybeSingle<ProfilMail>();
  return data;
}

/** Bienvenue : envoyé une fois, à la première connexion (adresse confirmée). */
export async function notifierBienvenue(utilisateurId: string): Promise<void> {
  if (!emailConfigure()) return;
  try {
    const p = await profil(utilisateurId);
    if (!p) return;
    await envoyerUneFois({
      cle: `bienvenue:${p.id}`,
      type: "bienvenue",
      utilisateurId: p.id,
      to: p.email,
      email: async () => {
        const { data: essai } = await adminClient().from("abonnements").select("fin").eq("utilisateur_id", p.id).eq("origine", "essai").maybeSingle<{ fin: string }>();
        const fin = essai ? new Date(essai.fin) : null;
        return emailBienvenue({ nom: p.nom, site: site(), lienParrainage: lienDecouvrir(p.code_parrainage, site()), essaiFin: fin && fin > new Date() ? fin : null });
      },
    });
  } catch (e) {
    console.error("[email] bienvenue", (e as Error).message);
  }
}

/** Confirmation à l'enseignant (avec lien vers le reçu) et alerte aux administrateurs. */
export async function notifierPaiement(paiement: { id: string; utilisateur_id: string; formule_id: string; montant_fcfa: number; transaction_id: string }): Promise<void> {
  if (!emailConfigure()) return;
  try {
    const db = adminClient();
    const [p, { data: f }, { data: abo }] = await Promise.all([
      profil(paiement.utilisateur_id),
      db.from("formules").select("libelle").eq("id", paiement.formule_id).maybeSingle<{ libelle: string }>(),
      db.from("abonnements").select("fin").eq("paiement_id", paiement.id).maybeSingle<{ fin: string }>(),
    ]);
    if (!p) return;
    const formule = f?.libelle ?? paiement.formule_id;
    await envoyerUneFois({
      cle: `paiement:${paiement.id}`,
      type: "paiement",
      utilisateurId: p.id,
      to: p.email,
      email: () =>
        emailPaiement({ nom: p.nom, formule, montant: paiement.montant_fcfa, fin: abo ? new Date(abo.fin) : null, lienRecu: `${site()}/recu/${encodeURIComponent(paiement.transaction_id)}`, site: site() }),
    });
    const admins = (process.env.ADMIN_EMAILS ?? "").split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean);
    for (const a of admins) {
      await envoyerUneFois({
        cle: `admin_paiement:${paiement.id}:${a}`,
        type: "admin_paiement",
        to: a,
        email: () => emailAdminPaiement({ email: p.email, nom: p.nom, formule, montant: paiement.montant_fcfa, transaction: paiement.transaction_id, lienAdmin: `${site()}/admin` }),
      });
    }
  } catch (e) {
    console.error("[email] paiement", (e as Error).message);
  }
}

/** Le parrain est prévenu de chaque commission gagnée. */
export async function notifierCommission(o: { parrainId: string; filleulId: string; paiementId: string; montant: number }): Promise<void> {
  if (!emailConfigure()) return;
  try {
    const [parrain, filleul, { data: dues }] = await Promise.all([
      profil(o.parrainId),
      profil(o.filleulId),
      adminClient().from("commissions").select("montant_fcfa").eq("parrain_id", o.parrainId).eq("statut", "due"),
    ]);
    if (!parrain) return;
    const totalDu = (dues ?? []).reduce((s, c) => s + (c.montant_fcfa as number), 0);
    await envoyerUneFois({
      cle: `commission:${o.paiementId}`,
      type: "commission",
      utilisateurId: parrain.id,
      to: parrain.email,
      email: () => emailCommission({ nom: parrain.nom, montant: o.montant, filleul: filleul?.nom || "un collègue", totalDu, site: site() }),
    });
  } catch (e) {
    console.error("[email] commission", (e as Error).message);
  }
}

/**
 * Rappels quotidiens (tâche planifiée) :
 *  - fin de l'essai gratuit sans abonnement payé → invitation à s'abonner (avec le meilleur code promo actif) ;
 *  - abonnement mensuel ou annuel qui se termine dans 3 jours ou moins, sans renouvellement → rappel.
 */
export async function envoyerRappels(maintenant = new Date()): Promise<{ finEssai: number; rappelFin: number }> {
  const res = { finEssai: 0, rappelFin: 0 };
  if (!emailConfigure()) return res;
  const db = adminClient();
  const [{ data: essais }, { data: finissants }, { data: formules }, { data: promos }] = await Promise.all([
    db
      .from("abonnements")
      .select("utilisateur_id, fin")
      .eq("origine", "essai")
      .gte("fin", new Date(maintenant.getTime() - 3 * JOUR).toISOString())
      .lte("fin", maintenant.toISOString())
      .limit(1000),
    db
      .from("abonnements")
      .select("utilisateur_id, fin, formule_id")
      .neq("origine", "essai")
      .gte("fin", maintenant.toISOString())
      .lte("fin", new Date(maintenant.getTime() + 3 * JOUR).toISOString())
      .limit(1000),
    db.from("formules").select("id, prix_fcfa").eq("active", true),
    db.from("codes_promo").select("*").eq("actif", true).order("remise_pct", { ascending: false }).limit(5),
  ]);
  const prix = Object.fromEntries((formules ?? []).map((f) => [f.id as string, f.prix_fcfa as number]));
  const promo = ((promos ?? []) as CodePromo[]).find((x) => !x.expire_le || new Date(x.expire_le) > maintenant) ?? null;

  // Fin la plus lointaine de chaque utilisateur concerné : pas de rappel s'il a déjà renouvelé.
  const ids = [...new Set([...(essais ?? []), ...(finissants ?? [])].map((a) => a.utilisateur_id as string))];
  const finMax = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from("abonnements").select("utilisateur_id, fin").in("utilisateur_id", ids.slice(i, i + 200));
    for (const a of data ?? []) finMax.set(a.utilisateur_id as string, Math.max(finMax.get(a.utilisateur_id as string) ?? 0, new Date(a.fin as string).getTime()));
  }

  for (const e of essais ?? []) {
    const id = e.utilisateur_id as string;
    if ((finMax.get(id) ?? 0) > maintenant.getTime()) continue;
    const p = await profil(id);
    if (!p || p.suspendu || p.role === "admin") continue;
    const ok = await envoyerUneFois({
      cle: `fin_essai:${id}`,
      type: "fin_essai",
      utilisateurId: id,
      to: p.email,
      email: () => emailFinEssai({ nom: p.nom, site: site(), prix: { journalier: prix.journalier ?? null, mensuel: prix.mensuel ?? 2000, annuel: prix.annuel ?? 15000 }, promo }),
    });
    if (ok) res.finEssai++;
  }

  for (const a of finissants ?? []) {
    const id = a.utilisateur_id as string;
    const fin = new Date(a.fin as string);
    if (a.formule_id === "journalier") continue; // pass de 24 h : pas de rappel
    if ((finMax.get(id) ?? 0) > fin.getTime()) continue;
    const p = await profil(id);
    if (!p || p.suspendu || p.role === "admin") continue;
    const ok = await envoyerUneFois({
      cle: `rappel_fin:${id}:${fin.toISOString().slice(0, 10)}`,
      type: "rappel_fin",
      utilisateurId: id,
      to: p.email,
      email: () => emailRappelFin({ nom: p.nom, fin, jours: Math.max(1, Math.ceil((fin.getTime() - maintenant.getTime()) / JOUR)), site: site() }),
    });
    if (ok) res.rappelFin++;
  }
  return res;
}
