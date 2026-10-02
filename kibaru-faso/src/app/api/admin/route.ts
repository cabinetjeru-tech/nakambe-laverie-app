import { z } from "zod";
import { finAbonnement, nouveauCodeLicence, prixValide, statsAmbassadeur, tauxCommission, tauxPour } from "@/lib/abonnement";
import { activerAbonnement, compteCourant, formules, traiterPaiement, type Profil } from "@/lib/comptes";
import { debutJour, tauxUsdFcfa, usdEnFcfa } from "@/lib/couts";
import { diagnosticCinetpay } from "@/lib/paiement/cinetpay";
import { testerIA } from "@/lib/llm";
import { emailConfigure, envoyerEmail, expediteur } from "@/lib/email/envoi";
import { emailTest } from "@/lib/email/modeles";
import { site } from "@/lib/email/notifications";
import { resumeDe, slugifier } from "@/lib/vitrine";
import { accountsEnabled, adminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Espace administration : réservé aux comptes « admin » (ADMIN_EMAILS). */
async function admin() {
  if (!accountsEnabled()) return { error: Response.json({ error: "Comptes non configurés." }, { status: 404 }) };
  const compte = await compteCourant().catch(() => null);
  if (!compte) return { error: Response.json({ error: "Connectez-vous." }, { status: 401 }) };
  if (compte.profil.role !== "admin" || compte.profil.suspendu) return { error: Response.json({ error: "Accès réservé à l'administration." }, { status: 403 }) };
  return { compte };
}

export async function GET() {
  const a = await admin();
  if (a.error) return a.error;
  const db = adminClient();
  const il30j = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const debutMoisUtc = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [profils, abos, paiements, preps, offres, coms, promos, paiementsPromo, conso, mails, temoignages, fiches, erreurs, ambs, ventes, etabs, membres] = await Promise.all([
    db.from("profils").select("*").order("cree_le", { ascending: false }).limit(10000),
    db.from("abonnements").select("utilisateur_id, fin, origine").limit(50000),
    db.from("paiements").select("id, utilisateur_id, formule_id, montant_fcfa, statut, moyen, transaction_id, cree_le").order("cree_le", { ascending: false }).limit(300),
    db.from("preparations").select("utilisateur_id").limit(100000),
    formules(true),
    db.from("commissions").select("id, parrain_id, filleul_id, montant_fcfa, taux, statut, versee_le, reference_versement, cree_le").order("cree_le", { ascending: false }).limit(2000),
    db.from("codes_promo").select("*").order("cree_le", { ascending: false }),
    db.from("paiements").select("code_promo").eq("statut", "reussi").not("code_promo", "is", null).limit(50000),
    db.from("usages").select("utilisateur_id, cree_le, cout_usd, decompte").gte("cree_le", il30j).limit(200000),
    db.from("emails_envoyes").select("cle", { count: "exact", head: true }).gte("cree_le", debutMoisUtc),
    db.from("temoignages").select("*").order("publie").order("ordre").order("cree_le", { ascending: false }).limit(500),
    db.from("fiches_publiques").select("slug, titre, classe, discipline, publie, vues, cree_le").order("cree_le", { ascending: false }).limit(1000),
    db.from("journal_erreurs").select("id, cree_le, source, detail").order("cree_le", { ascending: false }).limit(15),
    db.from("ambassadeurs").select("*").order("cree_le"),
    db.from("paiements").select("utilisateur_id, montant_fcfa, cree_le").eq("statut", "reussi").limit(100000),
    db.from("etablissements").select("*").order("cree_le", { ascending: false }),
    db.from("etablissement_membres").select("etablissement_id, utilisateur_id, cree_le").limit(100000),
  ]);
  // Coût de l'IA : aujourd'hui, depuis le début du mois, et par enseignant sur 30 jours.
  const taux = tauxUsdFcfa();
  const jour = debutJour().toISOString();
  const debutMoisIso = debutMoisUtc;
  let coutJour = 0;
  let coutMois = 0;
  let generationsJour = 0;
  const parEnseignant = new Map<string, { generations: number; cout: number }>();
  for (const u of conso.data ?? []) {
    const cout = Number(u.cout_usd);
    if (u.cree_le >= jour) {
      coutJour += cout;
      if (u.decompte) generationsJour++;
    }
    if (u.cree_le >= debutMoisIso) coutMois += cout;
    if (u.utilisateur_id) {
      const e = parEnseignant.get(u.utilisateur_id) ?? { generations: 0, cout: 0 };
      if (u.decompte) e.generations++;
      e.cout += cout;
      parEnseignant.set(u.utilisateur_id, e);
    }
  }
  const usages = new Map<string, number>();
  for (const x of paiementsPromo.data ?? []) usages.set(x.code_promo as string, (usages.get(x.code_promo as string) ?? 0) + 1);
  const finPar = new Map<string, { fin: string }[]>();
  // Dernier abonnement de chaque enseignant (le plus lointain) : essai gratuit ou payé.
  const dernier = new Map<string, { fin: string; origine: string }>();
  for (const x of abos.data ?? []) {
    finPar.set(x.utilisateur_id, [...(finPar.get(x.utilisateur_id) ?? []), { fin: x.fin }]);
    const d = dernier.get(x.utilisateur_id);
    if (!d || x.fin > d.fin) dernier.set(x.utilisateur_id, { fin: x.fin, origine: x.origine });
  }
  const prepsPar = new Map<string, number>();
  for (const x of preps.data ?? []) prepsPar.set(x.utilisateur_id, (prepsPar.get(x.utilisateur_id) ?? 0) + 1);
  const now = new Date();
  const enseignants = ((profils.data ?? []) as Profil[]).map((p) => {
    const fin = finAbonnement(finPar.get(p.id) ?? []);
    const actif = !!fin && fin > now;
    return {
      ...p,
      fin: fin?.toISOString() ?? null,
      actif,
      essai: actif && dernier.get(p.id)?.origine === "essai",
      preparations: prepsPar.get(p.id) ?? 0,
      filleuls: 0,
      generations30j: parEnseignant.get(p.id)?.generations ?? 0,
      cout30jFcfa: usdEnFcfa(parEnseignant.get(p.id)?.cout ?? 0, taux),
    };
  });
  const emails = new Map(enseignants.map((e) => [e.id, e.email]));
  const filleulsPar = new Map<string, number>();
  for (const e of enseignants) if (e.parrain_id) filleulsPar.set(e.parrain_id, (filleulsPar.get(e.parrain_id) ?? 0) + 1);
  for (const e of enseignants) e.filleuls = filleulsPar.get(e.id) ?? 0;
  const parrainDe = new Map(enseignants.map((e) => [e.id, e.parrain_id]));
  const commissions = (coms.data ?? []).map((c) => ({
    ...c,
    parrain: emails.get(c.parrain_id) ?? "—",
    telephone: enseignants.find((e) => e.id === c.parrain_id)?.telephone ?? null,
    filleul: emails.get(c.filleul_id) ?? "—",
  }));
  const debutMois = new Date(now.getFullYear(), now.getMonth(), 1);
  const reussis = (paiements.data ?? []).filter((p) => p.statut === "reussi");
  // Ambassadeurs : indicateurs du mois et cumulés, commissions, classement par ventes du mois.
  const ventesTout = (ventes.data ?? []) as { utilisateur_id: string; montant_fcfa: number; cree_le: string }[];
  const ambassadeurs = (ambs.data ?? [])
    .map((a) => {
      const e = enseignants.find((x) => x.id === a.profil_id);
      const sesCommissions = commissions.filter((c) => c.parrain_id === a.profil_id);
      return {
        ...a,
        email: e?.email ?? "—",
        nom: e?.nom ?? null,
        telephone: e?.telephone ?? null,
        code_parrainage: e?.code_parrainage ?? "",
        acces_fin: e?.fin ?? null,
        taux_effectif: tauxPour(a, tauxCommission()),
        stats: statsAmbassadeur(
          enseignants.filter((x) => x.parrain_id === a.profil_id),
          ventesTout,
          debutMois,
        ),
        commissionsDues: sesCommissions.filter((c) => c.statut === "due").reduce((s, c) => s + c.montant_fcfa, 0),
        commissionsVersees: sesCommissions.filter((c) => c.statut === "versee").reduce((s, c) => s + c.montant_fcfa, 0),
      };
    })
    .sort((x, y) => Number(y.actif) - Number(x.actif) || y.stats.ventesMois - x.stats.ventesMois || y.stats.inscritsMois - x.stats.inscritsMois);
  const etablissements = (etabs.data ?? []).map((e) => {
    const m = (membres.data ?? []).filter((x) => x.etablissement_id === e.id);
    return {
      ...e,
      ambassadeur: e.ambassadeur_id ? (emails.get(e.ambassadeur_id) ?? "—") : null,
      membres: m.map((x) => ({ email: emails.get(x.utilisateur_id) ?? "—", nom: enseignants.find((y) => y.id === x.utilisateur_id)?.nom ?? null, cree_le: x.cree_le })),
    };
  });
  return Response.json({
    stats: {
      enseignants: enseignants.length,
      abonnesActifs: enseignants.filter((e) => e.actif && !e.essai && e.role !== "admin").length,
      enEssai: enseignants.filter((e) => e.essai).length,
      parraines: enseignants.filter((e) => parrainDe.get(e.id)).length,
      commissionsDues: commissions.filter((c) => c.statut === "due").reduce((s, c) => s + c.montant_fcfa, 0),
      generationsJour,
      coutJourFcfa: usdEnFcfa(coutJour, taux),
      coutMoisFcfa: usdEnFcfa(coutMois, taux),
      tauxUsdFcfa: taux,
      emailsActifs: emailConfigure(),
      emailsMois: mails.count ?? 0,
      expediteur: expediteur().email,
      preparations: preps.data?.length ?? 0,
      recettesMois: reussis.filter((p) => new Date(p.cree_le) >= debutMois).reduce((s, p) => s + p.montant_fcfa, 0),
      recettesTotal: reussis.reduce((s, p) => s + p.montant_fcfa, 0),
    },
    enseignants,
    paiements: (paiements.data ?? []).map((p) => ({ ...p, email: emails.get(p.utilisateur_id) ?? "—" })),
    formules: offres,
    commissions,
    promos: (promos.data ?? []).map((p) => ({ ...p, utilisations: usages.get(p.code) ?? 0 })),
    moi: a.compte.profil.id,
    codeParrainage: a.compte.profil.code_parrainage,
    temoignages: temoignages.data ?? [],
    fiches: fiches.data ?? [],
    erreurs: erreurs.data ?? [],
    ambassadeurs,
    etablissements,
    tauxParrainage: tauxCommission(),
  });
}

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activer"), utilisateur: z.uuid(), jours: z.number().int().min(1).max(730), note: z.string().max(200).optional() }),
  z.object({ action: z.literal("suspendre"), utilisateur: z.uuid(), suspendu: z.boolean() }),
  z.object({ action: z.literal("role"), utilisateur: z.uuid(), role: z.enum(["enseignant", "admin"]) }),
  z.object({
    action: z.literal("formule"),
    id: z.string().regex(/^[a-z0-9_-]{2,40}$/),
    libelle: z.string().trim().min(2).max(80),
    prix_fcfa: z.number().int(),
    duree_jours: z.number().int().min(1).max(730),
    active: z.boolean(),
    quota_jour: z.number().int().min(1).max(10000).nullable().optional(),
    quota_periode: z.number().int().min(1).max(100000).nullable().optional(),
  }),
  z.object({ action: z.literal("verifier_paiement"), transaction: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/) }),
  z.object({
    action: z.literal("promo"),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/),
    description: z.string().trim().max(120).optional(),
    remise_pct: z.number().int().min(1).max(90),
    actif: z.boolean(),
    expire_le: z.string().max(40).nullable().optional(),
    max_utilisations: z.number().int().min(1).max(1_000_000).nullable().optional(),
  }),
  z.object({ action: z.literal("email_test") }),
  z.object({ action: z.literal("test_cinetpay") }),
  z.object({ action: z.literal("test_ia") }),
  z.object({
    action: z.literal("temoignage_ajouter"),
    nom: z.string().trim().min(2).max(80),
    fonction: z.string().trim().max(80).optional(),
    ville: z.string().trim().max(80).optional(),
    texte: z.string().trim().min(10).max(600),
    note: z.number().int().min(1).max(5),
  }),
  z.object({ action: z.literal("temoignage"), id: z.uuid(), publie: z.boolean().optional(), ordre: z.number().int().min(0).max(999).optional(), supprimer: z.boolean().optional() }),
  z.object({
    action: z.literal("fiche_publier"),
    titre: z.string().trim().min(3).max(160),
    classe: z.string().trim().max(40).optional(),
    discipline: z.string().trim().max(80).optional(),
    contenu: z.string().trim().min(50).max(100_000),
  }),
  z.object({ action: z.literal("fiche"), slug: z.string().regex(/^[a-z0-9-]{3,120}$/), publie: z.boolean().optional(), supprimer: z.boolean().optional() }),
  z.object({ action: z.literal("commission"), id: z.uuid(), statut: z.enum(["versee", "annulee", "due"]), reference: z.string().trim().max(120).optional() }),
  z.object({
    action: z.literal("ambassadeur"),
    email: z.string().trim().toLowerCase().email("Adresse e-mail invalide."),
    region: z.string().trim().max(80).optional(),
    zone: z.string().trim().max(120).optional(),
    disciplines: z.string().trim().max(160).optional(),
    taux: z.number().min(1).max(50).nullable().optional(),
    objectif_mois: z.number().int().min(1).max(10000).nullable().optional(),
    actif: z.boolean(),
    note: z.string().trim().max(300).optional(),
    offrir_acces_jours: z.number().int().min(1).max(730).optional(),
  }),
  z.object({ action: z.literal("ambassadeur_retirer"), utilisateur: z.uuid() }),
  z.object({
    action: z.literal("etablissement"),
    id: z.uuid().optional(),
    nom: z.string().trim().min(2).max(160),
    ville: z.string().trim().max(80).optional(),
    contact_nom: z.string().trim().max(120).optional(),
    contact_telephone: z.string().trim().max(40).optional(),
    contact_email: z.string().trim().max(160).optional(),
    places: z.number().int().min(1).max(5000),
    duree_jours: z.number().int().min(1).max(730),
    montant_fcfa: z.number().int().min(0).max(100_000_000),
    ambassadeur_email: z.string().trim().toLowerCase().max(160).optional(),
    actif: z.boolean(),
    expire_le: z.string().max(40).nullable().optional(),
    note: z.string().trim().max(300).optional(),
  }),
]);

export async function POST(req: Request) {
  const a = await admin();
  if (a.error) return a.error;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Action invalide." }, { status: 400 });
  const x = parsed.data;
  const db = adminClient();
  const moi = a.compte.profil.id;
  switch (x.action) {
    case "activer": {
      const p = await activerAbonnement({ utilisateurId: x.utilisateur, jours: x.jours, origine: "admin", note: x.note ?? `Accordé par ${a.compte.profil.email}` });
      return Response.json({ ok: true, fin: p.fin.toISOString() });
    }
    case "suspendre":
      if (x.utilisateur === moi) return Response.json({ error: "Vous ne pouvez pas suspendre votre propre compte." }, { status: 400 });
      await db.from("profils").update({ suspendu: x.suspendu }).eq("id", x.utilisateur);
      return Response.json({ ok: true });
    case "role":
      if (x.utilisateur === moi) return Response.json({ error: "Vous ne pouvez pas modifier votre propre rôle." }, { status: 400 });
      await db.from("profils").update({ role: x.role }).eq("id", x.utilisateur);
      return Response.json({ ok: true });
    case "formule":
      if (!prixValide(x.prix_fcfa)) return Response.json({ error: "Prix invalide : nombre entier, multiple de 5, au moins 100 FCFA." }, { status: 400 });
      await db.from("formules").upsert({ id: x.id, libelle: x.libelle, prix_fcfa: x.prix_fcfa, duree_jours: x.duree_jours, active: x.active, quota_jour: x.quota_jour ?? null, quota_periode: x.quota_periode ?? null });
      return Response.json({ ok: true });
    case "promo": {
      const expire = x.expire_le ? new Date(x.expire_le) : null;
      if (expire && Number.isNaN(expire.getTime())) return Response.json({ error: "Date d'expiration invalide." }, { status: 400 });
      const { error } = await db.from("codes_promo").upsert({
        code: x.code,
        description: x.description || null,
        remise_pct: x.remise_pct,
        actif: x.actif,
        expire_le: expire?.toISOString() ?? null,
        max_utilisations: x.max_utilisations ?? null,
      });
      if (error) return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
      return Response.json({ ok: true });
    }
    case "commission": {
      const patch =
        x.statut === "versee"
          ? { statut: "versee", versee_le: new Date().toISOString(), reference_versement: x.reference || null }
          : { statut: x.statut, versee_le: null, reference_versement: null };
      const { error } = await db.from("commissions").update(patch).eq("id", x.id);
      if (error) return Response.json({ error: "Mise à jour impossible." }, { status: 500 });
      return Response.json({ ok: true });
    }
    case "ambassadeur": {
      const { data: p } = await db.from("profils").select("id").ilike("email", x.email).maybeSingle<{ id: string }>();
      if (!p) return Response.json({ error: "Aucun compte enseignant avec cette adresse : l'ambassadeur doit d'abord créer son compte." }, { status: 400 });
      const { error } = await db.from("ambassadeurs").upsert({
        profil_id: p.id,
        region: x.region || null,
        zone: x.zone || null,
        disciplines: x.disciplines || null,
        taux: x.taux ?? null,
        objectif_mois: x.objectif_mois ?? null,
        actif: x.actif,
        note: x.note || null,
      });
      if (error) return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
      if (x.offrir_acces_jours) {
        const per = await activerAbonnement({ utilisateurId: p.id, jours: x.offrir_acces_jours, formuleId: "annuel", origine: "admin", note: `Accès ambassadeur offert par ${a.compte.profil.email}` });
        return Response.json({ ok: true, fin: per.fin.toISOString() });
      }
      return Response.json({ ok: true });
    }
    case "ambassadeur_retirer": {
      const { error } = await db.from("ambassadeurs").delete().eq("profil_id", x.utilisateur);
      if (error) return Response.json({ error: "Suppression impossible." }, { status: 500 });
      return Response.json({ ok: true });
    }
    case "etablissement": {
      let ambassadeurId: string | null = null;
      if (x.ambassadeur_email) {
        const { data: amb } = await db.from("profils").select("id").ilike("email", x.ambassadeur_email).maybeSingle<{ id: string }>();
        if (!amb) return Response.json({ error: "Ambassadeur introuvable : vérifiez son adresse e-mail." }, { status: 400 });
        ambassadeurId = amb.id;
      }
      const expire = x.expire_le ? new Date(x.expire_le) : null;
      if (expire && Number.isNaN(expire.getTime())) return Response.json({ error: "Date limite invalide." }, { status: 400 });
      const champs = {
        nom: x.nom,
        ville: x.ville || null,
        contact_nom: x.contact_nom || null,
        contact_telephone: x.contact_telephone || null,
        contact_email: x.contact_email || null,
        places: x.places,
        duree_jours: x.duree_jours,
        montant_fcfa: x.montant_fcfa,
        ambassadeur_id: ambassadeurId,
        actif: x.actif,
        expire_le: expire?.toISOString() ?? null,
        note: x.note || null,
      };
      if (x.id) {
        const { error } = await db.from("etablissements").update(champs).eq("id", x.id);
        if (error) return Response.json({ error: "Mise à jour impossible." }, { status: 500 });
        return Response.json({ ok: true });
      }
      // Nouveau code de licence (nouvel essai en cas de collision, très improbable).
      for (let i = 0; i < 5; i++) {
        const code = nouveauCodeLicence();
        const { error } = await db.from("etablissements").insert({ ...champs, code });
        if (!error) return Response.json({ ok: true, message: `code de licence ${code}` });
        if (error.code !== "23505") return Response.json({ error: "Création impossible." }, { status: 500 });
      }
      return Response.json({ error: "Création impossible, réessayez." }, { status: 500 });
    }
    case "temoignage_ajouter": {
      const { error } = await db.from("temoignages").insert({ nom: x.nom, fonction: x.fonction || null, ville: x.ville || null, texte: x.texte, note: x.note, publie: true });
      if (error) return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
      return Response.json({ ok: true });
    }
    case "temoignage": {
      const r = x.supprimer
        ? await db.from("temoignages").delete().eq("id", x.id)
        : await db
            .from("temoignages")
            .update({ ...(x.publie !== undefined ? { publie: x.publie } : {}), ...(x.ordre !== undefined ? { ordre: x.ordre } : {}) })
            .eq("id", x.id);
      if (r.error) return Response.json({ error: "Mise à jour impossible." }, { status: 500 });
      return Response.json({ ok: true });
    }
    case "fiche_publier": {
      const slug = slugifier([x.titre, x.discipline, x.classe].filter(Boolean).join(" "));
      const { error } = await db.from("fiches_publiques").insert({
        slug,
        titre: x.titre,
        classe: x.classe || null,
        discipline: x.discipline || null,
        resume: resumeDe(x.contenu) || null,
        contenu: x.contenu,
        auteur_id: moi,
      });
      if (error) return Response.json({ error: "Publication impossible." }, { status: 500 });
      return Response.json({ ok: true, message: `${site()}/fiches/${slug}` });
    }
    case "fiche": {
      const r = x.supprimer
        ? await db.from("fiches_publiques").delete().eq("slug", x.slug)
        : await db.from("fiches_publiques").update({ publie: !!x.publie, maj_le: new Date().toISOString() }).eq("slug", x.slug);
      if (r.error) return Response.json({ error: "Mise à jour impossible." }, { status: 500 });
      return Response.json({ ok: true });
    }
    case "test_ia": {
      const [standard, expert] = await Promise.all([testerIA(), testerIA("expert")]);
      const message = `Préparations : ${standard.message} · Mode expert : ${expert.message}`;
      return standard.ok && expert.ok ? Response.json({ ok: true, message }) : Response.json({ error: message }, { status: 502 });
    }
    case "test_cinetpay": {
      const r = await diagnosticCinetpay();
      return r.ok ? Response.json({ ok: true, message: r.message }) : Response.json({ error: r.message }, { status: 502 });
    }
    case "email_test": {
      if (!emailConfigure()) return Response.json({ error: "E-mails non configurés : ajoutez BREVO_API_KEY dans Vercel." }, { status: 400 });
      try {
        await envoyerEmail(a.compte.profil.email, emailTest(site()));
        return Response.json({ ok: true });
      } catch (e) {
        return Response.json({ error: `Envoi refusé : ${(e as Error).message}` }, { status: 502 });
      }
    }
    case "verifier_paiement": {
      const r = await traiterPaiement(x.transaction).catch((e: Error) => ({ statut: `erreur : ${e.message}` }));
      return Response.json({ ok: true, statut: r.statut });
    }
  }
}
