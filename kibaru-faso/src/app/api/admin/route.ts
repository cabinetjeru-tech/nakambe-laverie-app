import { z } from "zod";
import { finAbonnement, prixValide } from "@/lib/abonnement";
import { activerAbonnement, compteCourant, formules, traiterPaiement, type Profil } from "@/lib/comptes";
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
  const [profils, abos, paiements, preps, offres, coms, promos, paiementsPromo] = await Promise.all([
    db.from("profils").select("*").order("cree_le", { ascending: false }).limit(10000),
    db.from("abonnements").select("utilisateur_id, fin, origine").limit(50000),
    db.from("paiements").select("id, utilisateur_id, formule_id, montant_fcfa, statut, moyen, transaction_id, cree_le").order("cree_le", { ascending: false }).limit(300),
    db.from("preparations").select("utilisateur_id").limit(100000),
    formules(true),
    db.from("commissions").select("id, parrain_id, filleul_id, montant_fcfa, taux, statut, versee_le, reference_versement, cree_le").order("cree_le", { ascending: false }).limit(2000),
    db.from("codes_promo").select("*").order("cree_le", { ascending: false }),
    db.from("paiements").select("code_promo").eq("statut", "reussi").not("code_promo", "is", null).limit(50000),
  ]);
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
  return Response.json({
    stats: {
      enseignants: enseignants.length,
      abonnesActifs: enseignants.filter((e) => e.actif && !e.essai && e.role !== "admin").length,
      enEssai: enseignants.filter((e) => e.essai).length,
      parraines: enseignants.filter((e) => parrainDe.get(e.id)).length,
      commissionsDues: commissions.filter((c) => c.statut === "due").reduce((s, c) => s + c.montant_fcfa, 0),
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
  z.object({ action: z.literal("commission"), id: z.uuid(), statut: z.enum(["versee", "annulee", "due"]), reference: z.string().trim().max(120).optional() }),
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
      await db.from("formules").upsert({ id: x.id, libelle: x.libelle, prix_fcfa: x.prix_fcfa, duree_jours: x.duree_jours, active: x.active });
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
    case "verifier_paiement": {
      const r = await traiterPaiement(x.transaction).catch((e: Error) => ({ statut: `erreur : ${e.message}` }));
      return Response.json({ ok: true, statut: r.statut });
    }
  }
}
