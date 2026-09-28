import "server-only";
import { finAbonnement, joursRestants, nouvellePeriode, type Formule } from "./abonnement";
import { verifierPaiement } from "./paiement/cinetpay";
import { adminClient, sessionClient } from "./supabase/server";

/** Comptes enseignants : profil, abonnement, accès, activation après paiement. Côté serveur uniquement. */

export type Profil = {
  id: string;
  email: string;
  nom: string | null;
  telephone: string | null;
  etablissement: string | null;
  ville: string | null;
  role: "enseignant" | "admin";
  suspendu: boolean;
  cree_le: string;
};

export type Compte = { profil: Profil; fin: Date | null; acces: boolean; joursRestants: number };

/** Adresses e-mail des administrateurs (variable ADMIN_EMAILS, séparées par des virgules). */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Enseignant connecté (session vérifiée auprès de Supabase), ou null. */
export async function utilisateurCourant(): Promise<{ id: string; email: string } | null> {
  const { data, error } = await (await sessionClient()).auth.getUser();
  if (error || !data.user?.email) return null;
  return { id: data.user.id, email: data.user.email };
}

export function aAcces(profil: Pick<Profil, "role" | "suspendu">, fin: Date | null, maintenant = new Date()): boolean {
  if (profil.suspendu) return false;
  if (profil.role === "admin") return true;
  return !!fin && fin > maintenant;
}

export async function chargerCompte(user: { id: string; email: string }): Promise<Compte> {
  const db = adminClient();
  let { data: profil } = await db.from("profils").select("*").eq("id", user.id).maybeSingle<Profil>();
  if (!profil) {
    const r = await db.from("profils").upsert({ id: user.id, email: user.email }).select("*").single<Profil>();
    if (r.error) throw new Error(`Profil illisible (${r.error.code ?? ""} ${r.error.message}) : vérifier SUPABASE_SECRET_KEY.`);
    profil = r.data;
  }
  if (!profil) throw new Error("Profil introuvable.");
  // Les adresses listées dans ADMIN_EMAILS deviennent administratrices à leur connexion.
  if (profil.role !== "admin" && adminEmails().includes(user.email.toLowerCase())) {
    await db.from("profils").update({ role: "admin" }).eq("id", user.id);
    profil = { ...profil, role: "admin" };
  }
  const { data: abos } = await db.from("abonnements").select("fin").eq("utilisateur_id", user.id).order("fin", { ascending: false }).limit(1);
  const fin = finAbonnement(abos ?? []);
  const now = new Date();
  return { profil, fin, acces: aAcces(profil, fin, now), joursRestants: joursRestants(fin, now) };
}

/** Enseignant connecté avec son compte ; null s'il n'est pas connecté. */
export async function compteCourant(): Promise<Compte | null> {
  const user = await utilisateurCourant();
  return user ? chargerCompte(user) : null;
}

export async function formules(toutes = false): Promise<Formule[]> {
  let q = adminClient().from("formules").select("*").order("ordre");
  if (!toutes) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []) as Formule[];
}

/** Ajoute des jours d'abonnement (prolonge l'abonnement en cours s'il n'est pas terminé). */
export async function activerAbonnement(o: { utilisateurId: string; jours: number; formuleId?: string | null; paiementId?: string; origine: "paiement" | "admin"; note?: string }) {
  const db = adminClient();
  const { data: abos } = await db.from("abonnements").select("fin").eq("utilisateur_id", o.utilisateurId).order("fin", { ascending: false }).limit(1);
  const p = nouvellePeriode(new Date(), finAbonnement(abos ?? []), o.jours);
  const { error } = await db.from("abonnements").insert({
    utilisateur_id: o.utilisateurId,
    formule_id: o.formuleId ?? null,
    debut: p.debut.toISOString(),
    fin: p.fin.toISOString(),
    origine: o.origine,
    paiement_id: o.paiementId ?? null,
    note: o.note ?? null,
  });
  // 23505 : ce paiement a déjà activé un abonnement (notification et retour arrivés tous les deux).
  if (error && error.code !== "23505") throw new Error(error.message);
  return p;
}

type PaiementRow = { id: string; utilisateur_id: string; formule_id: string; montant_fcfa: number; statut: string; transaction_id: string };

/**
 * Vérifie une transaction auprès de CinetPay et en tire les conséquences : statut du paiement et, s'il est réussi
 * avec le bon montant, activation de l'abonnement (une seule fois).
 */
export async function traiterPaiement(transactionId: string): Promise<{ statut: string; paiement?: PaiementRow }> {
  const db = adminClient();
  const { data: paiement } = await db.from("paiements").select("*").eq("transaction_id", transactionId).maybeSingle<PaiementRow>();
  if (!paiement) return { statut: "inconnu" };
  if (paiement.statut === "reussi") return { statut: "reussi", paiement };

  const v = await verifierPaiement(transactionId);
  let statut: string = v.statut;
  if (statut === "reussi" && (v.montant === undefined || v.montant < paiement.montant_fcfa)) statut = "echoue";
  if (statut === paiement.statut) return { statut, paiement };

  await db
    .from("paiements")
    .update({ statut, moyen: v.moyen ?? null, detail: v.brut as object, maj_le: new Date().toISOString() })
    .eq("id", paiement.id)
    .neq("statut", "reussi");
  if (statut === "reussi") {
    const { data: f } = await db.from("formules").select("duree_jours").eq("id", paiement.formule_id).single<{ duree_jours: number }>();
    await activerAbonnement({ utilisateurId: paiement.utilisateur_id, jours: f?.duree_jours ?? 30, formuleId: paiement.formule_id, paiementId: paiement.id, origine: "paiement" });
  }
  return { statut, paiement };
}
