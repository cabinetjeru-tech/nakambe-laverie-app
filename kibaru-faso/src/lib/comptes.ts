import "server-only";
import {
  estPass,
  finAbonnement,
  heuresRestantes,
  joursRestants,
  messageLicence,
  montantCommission,
  nouveauCodeParrainage,
  nouvellePeriode,
  passesDeductibles,
  refusPromo,
  statsAmbassadeur,
  tauxCommission,
  tauxPour,
  type CodePromo,
  type Formule,
} from "./abonnement";
import { coutUsd, debutJour, type Consommation } from "./couts";
import { notifierCommission, notifierPaiement } from "./email/notifications";
import type { EtatQuota } from "./quota";
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
  code_parrainage: string;
  parrain_id: string | null;
};

export type Compte = {
  profil: Profil;
  fin: Date | null;
  acces: boolean;
  joursRestants: number;
  heuresRestantes: number;
  /** Accès en cours issu de l'essai gratuit (fiche offerte), et non d'un paiement. */
  essai: boolean;
  /** Abonnement qui couvre le moment présent (pour le quota du jour). */
  enCours: { origine: string; formule_id: string | null; debut: string } | null;
};

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
    const r = await db.from("profils").upsert({ id: user.id, email: user.email, code_parrainage: nouveauCodeParrainage() }).select("*").single<Profil>();
    if (r.error) throw new Error(`Profil illisible (${r.error.code ?? ""} ${r.error.message}) : vérifier SUPABASE_SECRET_KEY.`);
    profil = r.data;
  }
  if (!profil) throw new Error("Profil introuvable.");
  // Les adresses listées dans ADMIN_EMAILS deviennent administratrices à leur connexion.
  if (profil.role !== "admin" && adminEmails().includes(user.email.toLowerCase())) {
    await db.from("profils").update({ role: "admin" }).eq("id", user.id);
    profil = { ...profil, role: "admin" };
  }
  const { data: abos } = await db.from("abonnements").select("fin, origine").eq("utilisateur_id", user.id).order("fin", { ascending: false }).limit(1);
  const fin = finAbonnement(abos ?? []);
  const now = new Date();
  const acces = aAcces(profil, fin, now);
  const { data: couvrant } = await db
    .from("abonnements")
    .select("origine, formule_id, debut")
    .eq("utilisateur_id", user.id)
    .lte("debut", now.toISOString())
    .gt("fin", now.toISOString())
    .order("debut", { ascending: false })
    .limit(1);
  return {
    enCours: couvrant?.[0] ?? null,
    profil,
    fin,
    acces,
    joursRestants: joursRestants(fin, now),
    heuresRestantes: heuresRestantes(fin, now),
    essai: acces && profil.role !== "admin" && abos?.[0]?.origine === "essai",
  };
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
export async function activerAbonnement(o: { utilisateurId: string; jours: number; formuleId?: string | null; paiementId?: string; origine: "paiement" | "admin" | "licence"; note?: string }) {
  const db = adminClient();
  const maintenant = new Date();
  // L'essai (fiche offerte, valable 30 jours) s'arrête dès qu'un vrai accès commence : le paiement n'attend pas sa fin.
  await db.from("abonnements").update({ fin: maintenant.toISOString() }).eq("utilisateur_id", o.utilisateurId).eq("origine", "essai").gt("fin", maintenant.toISOString()).lt("debut", maintenant.toISOString());
  const { data: abos } = await db.from("abonnements").select("fin").eq("utilisateur_id", o.utilisateurId).neq("origine", "essai").order("fin", { ascending: false }).limit(1);
  const p = nouvellePeriode(maintenant, finAbonnement(abos ?? []), o.jours);
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

type PaiementRow = { id: string; utilisateur_id: string; formule_id: string; montant_fcfa: number; statut: string; transaction_id: string; passes_deduits?: string[] | null };

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
    // Pass 24 h déduits de cet abonnement : ils ne pourront plus l'être une seconde fois.
    if (paiement.passes_deduits?.length) await db.from("paiements").update({ deduit_par: paiement.id }).in("id", paiement.passes_deduits).is("deduit_par", null);
    await enregistrerCommission(paiement).catch((e: Error) => console.error("[parrainage]", e.message));
    await notifierPaiement(paiement);
  }
  return { statut, paiement };
}

// ---------------------------------------------------------------- Parrainage

/** Durée minimale (jours) d'une formule pour donner lieu à commission : mensuel et annuel uniquement. */
export const DUREE_MIN_COMMISSION = 30;

/**
 * Commission du parrain (10 % par défaut, taux propre pour un ambassadeur) sur chaque paiement réussi de son filleul,
 * mensuel ou annuel. Condition : le parrain n'est pas suspendu, et il est abonné (ou administrateur) sauf s'il est
 * ambassadeur actif.
 * Un paiement ne donne qu'une commission (contrainte d'unicité sur paiement_id).
 */
async function enregistrerCommission(paiement: PaiementRow) {
  const db = adminClient();
  const { data: filleul } = await db.from("profils").select("parrain_id").eq("id", paiement.utilisateur_id).single<{ parrain_id: string | null }>();
  if (!filleul?.parrain_id || filleul.parrain_id === paiement.utilisateur_id) return;
  // Pas de commission sur les passes courts (journalier) : leur marge ne le permet pas.
  const { data: formule } = await db.from("formules").select("duree_jours").eq("id", paiement.formule_id).maybeSingle<{ duree_jours: number }>();
  if (!formule || formule.duree_jours < DUREE_MIN_COMMISSION) return;
  const [{ data: parrain }, { data: amb }] = await Promise.all([
    db.from("profils").select("*").eq("id", filleul.parrain_id).single<Profil>(),
    db.from("ambassadeurs").select("actif, taux").eq("profil_id", filleul.parrain_id).maybeSingle<{ actif: boolean; taux: number | null }>(),
  ]);
  if (!parrain || parrain.suspendu) return;
  // Un ambassadeur actif touche sa commission même sans abonnement personnel.
  if (!amb?.actif) {
    const { data: abos } = await db.from("abonnements").select("fin").eq("utilisateur_id", parrain.id).order("fin", { ascending: false }).limit(1);
    if (!aAcces(parrain, finAbonnement(abos ?? []))) return;
  }
  const taux = tauxPour(amb ?? null, tauxCommission());
  const montant = montantCommission(paiement.montant_fcfa, taux);
  const { error } = await db.from("commissions").insert({
    parrain_id: parrain.id,
    filleul_id: paiement.utilisateur_id,
    paiement_id: paiement.id,
    montant_fcfa: montant,
    taux,
  });
  if (error && error.code !== "23505") throw new Error(error.message);
  if (!error) await notifierCommission({ parrainId: parrain.id, filleulId: paiement.utilisateur_id, paiementId: paiement.id, montant });
}

export type Parrainage = {
  code: string;
  taux: number;
  filleuls: number;
  filleulsAbonnes: number;
  due: number;
  versee: number;
  commissions: { montant_fcfa: number; statut: string; cree_le: string; filleul: string }[];
};

export async function parrainage(profil: Profil): Promise<Parrainage> {
  const db = adminClient();
  const [{ data: filleuls }, { data: coms }, { data: amb }] = await Promise.all([
    db.from("profils").select("id, nom, email").eq("parrain_id", profil.id).limit(5000),
    db.from("commissions").select("montant_fcfa, statut, cree_le, filleul_id").eq("parrain_id", profil.id).order("cree_le", { ascending: false }).limit(500),
    db.from("ambassadeurs").select("actif, taux").eq("profil_id", profil.id).maybeSingle<{ actif: boolean; taux: number | null }>(),
  ]);
  const noms = new Map((filleuls ?? []).map((f) => [f.id as string, (f.nom as string | null) || (f.email as string).replace(/@.*/, "@…")]));
  const payeurs = new Set((coms ?? []).map((c) => c.filleul_id as string));
  const somme = (st: string) => (coms ?? []).filter((c) => c.statut === st).reduce((s, c) => s + (c.montant_fcfa as number), 0);
  return {
    code: profil.code_parrainage,
    taux: tauxPour(amb ?? null, tauxCommission()),
    filleuls: filleuls?.length ?? 0,
    filleulsAbonnes: payeurs.size,
    due: somme("due"),
    versee: somme("versee"),
    commissions: (coms ?? []).slice(0, 20).map((c) => ({ montant_fcfa: c.montant_fcfa, statut: c.statut, cree_le: c.cree_le, filleul: noms.get(c.filleul_id) ?? "—" })),
  };
}

// ---------------------------------------------------------------- Ambassadeurs

export type EspaceAmbassadeur = {
  region: string | null;
  zone: string | null;
  disciplines: string | null;
  taux: number;
  objectifMois: number | null;
  rang: number;
  total: number;
  stats: ReturnType<typeof statsAmbassadeur>;
};

/** Tableau de bord d'un ambassadeur actif (null s'il n'en est pas un) : ses chiffres et son rang du mois. */
export async function espaceAmbassadeur(profil: Profil): Promise<EspaceAmbassadeur | null> {
  const db = adminClient();
  const { data: amb } = await db.from("ambassadeurs").select("*").eq("profil_id", profil.id).maybeSingle();
  if (!amb?.actif) return null;
  const { data: tous } = await db.from("ambassadeurs").select("profil_id").eq("actif", true);
  const ids = (tous ?? []).map((a) => a.profil_id as string);
  const { data: filleuls } = await db.from("profils").select("id, cree_le, parrain_id").in("parrain_id", ids).limit(50000);
  const fids = (filleuls ?? []).map((f) => f.id as string);
  const ventes: { utilisateur_id: string; montant_fcfa: number; cree_le: string }[] = [];
  for (let i = 0; i < fids.length; i += 300) {
    const { data } = await db.from("paiements").select("utilisateur_id, montant_fcfa, cree_le").eq("statut", "reussi").in("utilisateur_id", fids.slice(i, i + 300));
    ventes.push(...((data ?? []) as typeof ventes));
  }
  const maintenant = new Date();
  const debutMois = new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1));
  const par = (id: string) => statsAmbassadeur((filleuls ?? []).filter((f) => f.parrain_id === id) as { id: string; cree_le: string }[], ventes, debutMois);
  // Classement du mois : ventes du mois, puis inscriptions du mois.
  const classement = ids.map((id) => ({ id, s: par(id) })).sort((a, b) => b.s.ventesMois - a.s.ventesMois || b.s.inscritsMois - a.s.inscritsMois);
  return {
    region: amb.region,
    zone: amb.zone,
    disciplines: amb.disciplines,
    taux: tauxPour(amb, tauxCommission()),
    objectifMois: amb.objectif_mois,
    rang: classement.findIndex((c) => c.id === profil.id) + 1,
    total: classement.length,
    stats: par(profil.id),
  };
}

// ---------------------------------------------------------------- Pass 24 h déduit de l'annuel

/** Crédit des pass 24 h payés depuis moins de 7 jours et pas encore déduits d'un abonnement annuel. */
export async function creditPass(utilisateurId: string): Promise<{ montant: number; passes: string[]; expire: string | null }> {
  const db = adminClient();
  const [{ data: offres }, { data }] = await Promise.all([
    db.from("formules").select("id, duree_jours"),
    db
      .from("paiements")
      .select("id, formule_id, montant_fcfa, cree_le, deduit_par")
      .eq("utilisateur_id", utilisateurId)
      .eq("statut", "reussi")
      .is("deduit_par", null)
      .gte("cree_le", new Date(Date.now() - 8 * 86_400_000).toISOString()),
  ]);
  const courtes = new Set((offres ?? []).filter((f) => estPass(f.duree_jours as number)).map((f) => f.id as string));
  const passes = passesDeductibles(((data ?? []) as { id: string; formule_id: string; montant_fcfa: number; cree_le: string; deduit_par: string | null }[]).filter((p) => courtes.has(p.formule_id)));
  const plusAncien = passes.reduce<string | null>((m, p) => (!m || p.cree_le < m ? p.cree_le : m), null);
  return {
    montant: passes.reduce((s, p) => s + p.montant_fcfa, 0),
    passes: passes.map((p) => p.id),
    expire: plusAncien ? new Date(new Date(plusAncien).getTime() + 7 * 86_400_000).toISOString() : null,
  };
}

// ---------------------------------------------------------------- Licences établissement

/** Active la place d'un enseignant dans la licence de son établissement (réservation atomique côté base). */
export async function rejoindreLicence(code: string, utilisateurId: string): Promise<{ ok: true; nom: string; fin: Date } | { erreur: string }> {
  const db = adminClient();
  const { data, error } = await db.rpc("rejoindre_licence", { p_code: code, p_utilisateur: utilisateurId });
  if (error) return { erreur: messageLicence(error.message) };
  const e = (data as { etablissement_id: string; nom: string; formule_id: string | null; duree_jours: number }[])[0];
  if (!e) return { erreur: messageLicence("") };
  const p = await activerAbonnement({ utilisateurId, jours: e.duree_jours, formuleId: e.formule_id ?? "annuel", origine: "licence", note: `Licence établissement : ${e.nom}` });
  return { ok: true, nom: e.nom, fin: p.fin };
}

// ---------------------------------------------------------------- Codes promo

/** Vérifie un code promo pour un enseignant : une utilisation par compte, dates et plafond respectés. */
export async function verifierPromo(code: string, utilisateurId: string): Promise<{ promo: CodePromo } | { erreur: string }> {
  const db = adminClient();
  const [{ data: promo }, { count: utilisations }, { count: siens }] = await Promise.all([
    db.from("codes_promo").select("*").eq("code", code).maybeSingle<CodePromo>(),
    db.from("paiements").select("id", { count: "exact", head: true }).eq("code_promo", code).eq("statut", "reussi"),
    db.from("paiements").select("id", { count: "exact", head: true }).eq("code_promo", code).eq("statut", "reussi").eq("utilisateur_id", utilisateurId),
  ]);
  const refus = refusPromo(promo ?? null, utilisations ?? 0, (siens ?? 0) > 0);
  return refus ? { erreur: refus } : { promo: promo! };
}

// ---------------------------------------------------------------- Quotas et coût de l'IA

/** Générations offertes à l'inscription, au total (QUOTA_ESSAI, 1 par défaut : une fiche gratuite). */
export function quotaEssai(): number {
  const q = Number(process.env.QUOTA_ESSAI);
  return Number.isInteger(q) && q > 0 ? q : 1;
}

/** Quota par défaut d'un accès accordé par l'administration (QUOTA_DEFAUT_JOUR, 30 par défaut). */
export function quotaDefaut(): number {
  const q = Number(process.env.QUOTA_DEFAUT_JOUR);
  return Number.isInteger(q) && q > 0 ? q : 5;
}

/** Nombre maximal de générations aujourd'hui (null = illimité, pour l'administration). */
export async function quotaJour(compte: Compte): Promise<number | null> {
  if (compte.profil.role === "admin") return null;
  const c = compte.enCours;
  if (!c) return 0;
  if (c.origine === "essai") return quotaEssai();
  if (!c.formule_id) return quotaDefaut();
  const { data } = await adminClient().from("formules").select("quota_jour").eq("id", c.formule_id).maybeSingle<{ quota_jour: number | null }>();
  return data ? data.quota_jour : quotaDefaut();
}

/** Unités consommées depuis une date (1 par génération, 2 en mode expert ; les questions de précision ne comptent pas). */
async function unitesDepuis(utilisateurId: string, depuis: Date): Promise<number> {
  const { data } = await adminClient()
    .from("usages")
    .select("unites")
    .eq("utilisateur_id", utilisateurId)
    .eq("decompte", true)
    .gte("cree_le", depuis.toISOString())
    .limit(100000);
  return (data ?? []).reduce((n, u) => n + ((u as { unites: number | null }).unites ?? 1), 0);
}

/** Générations comptées depuis minuit (heure du Burkina Faso = UTC). */
export function generationsDuJour(utilisateurId: string): Promise<number> {
  return unitesDepuis(utilisateurId, debutJour());
}

/** Plafond de générations sur toute la durée de la formule en cours, ou de l'essai (null = aucun : accès accordé, administration). */
export async function quotaPeriode(compte: Compte): Promise<number | null> {
  const c = compte.enCours;
  if (compte.profil.role === "admin" || !c) return null;
  if (c.origine === "essai") return quotaEssai();
  if (!c.formule_id) return null;
  const { data } = await adminClient().from("formules").select("quota_periode").eq("id", c.formule_id).maybeSingle<{ quota_periode: number | null }>();
  return data?.quota_periode ?? null;
}

export async function etatQuota(compte: Compte): Promise<EtatQuota> {
  const [limite, utilisees, limitePeriode] = await Promise.all([quotaJour(compte), generationsDuJour(compte.profil.id), quotaPeriode(compte)]);
  const periode =
    limitePeriode !== null && compte.enCours ? { limite: limitePeriode, utilisees: await unitesDepuis(compte.profil.id, new Date(compte.enCours.debut)) } : null;
  return { limite, utilisees, periode };
}

/** Enregistre la consommation d'un appel à l'IA (coût estimé au tarif public du modèle). */
export async function enregistrerUsage(u: { utilisateurId: string | null; modele: string; consommation: Consommation; besoin?: string; decompte: boolean; unites?: number }) {
  const { error } = await adminClient()
    .from("usages")
    .insert({
      utilisateur_id: u.utilisateurId,
      modele: u.modele,
      jetons_entree: u.consommation.entree,
      jetons_sortie: u.consommation.sortie,
      jetons_cache_lecture: u.consommation.cacheLecture,
      jetons_cache_ecriture: u.consommation.cacheEcriture,
      cout_usd: coutUsd(u.modele, u.consommation),
      besoin: u.besoin ?? null,
      decompte: u.decompte,
      unites: u.unites ?? 1,
    });
  if (error) console.error("[usage]", error.message);
}
