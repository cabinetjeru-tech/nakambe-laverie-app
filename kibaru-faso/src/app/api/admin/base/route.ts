import { z } from "zod";
import { DOC_TYPES, STATUTS } from "@/lib/base/structure";
import { ImportError, ligneDepuisRegistre, telechargerEtExtraire } from "@/lib/base/import-officiel";
import { exigerAdmin } from "@/lib/garde-admin";
import { journaliserErreur } from "@/lib/journal";
import { getBase, invaliderBaseEnLigne } from "@/lib/library";
import { adminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Texte extrait au plus (≈ 3 Mo en UTF-8, sous la limite de 4,5 Mo des requêtes Vercel). */
const TEXTE_MAX = 1_500_000;

/** Base documentaire (espace admin) : documents déposés en ligne et ressources du registre encore à déposer. */
export async function GET() {
  const a = await exigerAdmin();
  if (a.error) return a.error;
  const [{ data, error }, base] = await Promise.all([
    adminClient()
      .from("base_documents")
      .select("id, titre, type, classes, disciplines, organisme, annee, version, statut, source, url, niveau_source, avertissement, observations, fichier_nom, cree_le, maj_le, texte")
      .order("maj_le", { ascending: false }),
    getBase().catch(() => null),
  ]);
  if (error) return Response.json({ error: "Lecture de la base impossible." }, { status: 500 });
  return Response.json({
    documents: (data ?? []).map(({ texte, ...d }) => ({ ...d, caracteres: (texte as string).length, extrait: (texte as string).slice(0, 400) })),
    enAttente: (base?.pending ?? []).map((p) => ({
      documentId: p.documentId ?? null,
      titre: p.title,
      type: p.type ?? null,
      classes: p.classes,
      disciplines: p.disciplines,
      organisme: p.organisme ?? null,
      annee: p.annee ?? null,
      version: p.version ?? null,
      source: p.source ?? null,
      url: p.url ?? null,
      niveauSource: p.niveauSource ?? null,
      priorite: p.priorite ?? null,
    })),
    fichiers: (base?.docs ?? []).filter((d) => !d.id.startsWith("db:")).map((d) => ({ documentId: d.documentId ?? null, titre: d.title, statut: d.statut ?? null })),
  });
}

const texteCourt = (n: number) => z.string().trim().max(n).optional().transform((v) => v || null);
const champs = {
  titre: z.string().trim().min(3, "Titre trop court.").max(240),
  type: z.enum(Object.keys(DOC_TYPES) as [string, ...string[]]),
  classes: z.array(z.string().max(20)).max(7),
  disciplines: z.array(z.string().max(80)).max(6),
  organisme: texteCourt(200),
  annee: texteCourt(20),
  version: texteCourt(20),
  statut: z.enum(STATUTS),
  source: texteCourt(300),
  url: texteCourt(500),
  niveau_source: z.number().int().min(1).max(5).nullable().optional(),
  avertissement: texteCourt(600),
  observations: texteCourt(600),
};
const idSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{2,59}$/, "Identifiant invalide (lettres, chiffres et tirets, ex. BF-6E-MATH-001).");

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("deposer"),
    id: idSchema,
    ...champs,
    fichier_nom: texteCourt(200),
    texte: z.string().min(200, "Texte trop court : le document semble vide ou scanné.").max(TEXTE_MAX, "Document trop long : découpez-le en plusieurs parties."),
  }),
  z.object({ action: z.literal("modifier"), id: idSchema, ...champs }),
  z.object({ action: z.literal("supprimer"), id: idSchema }),
  z.object({ action: z.literal("importer"), id: idSchema }),
]);

export async function POST(req: Request) {
  const a = await exigerAdmin();
  if (a.error) return a.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Données invalides." }, { status: 400 });
  const x = parsed.data;
  const db = adminClient();
  const maintenant = new Date().toISOString();
  let r;
  if (x.action === "importer") {
    // Import automatique d'une ressource du registre depuis son lien officiel.
    const base = await getBase();
    const entree = base.registry.find((e) => e.meta.documentId?.toUpperCase() === x.id);
    if (!entree?.meta.url) return Response.json({ error: `${x.id} : aucun lien officiel connu dans le registre.` }, { status: 400 });
    try {
      const { texte, fichierNom } = await telechargerEtExtraire(entree.meta.url);
      r = await db.from("base_documents").upsert(ligneDepuisRegistre(entree.meta, entree.meta.url, texte, fichierNom, a.compte.profil.id));
      if (!r.error) {
        invaliderBaseEnLigne();
        return Response.json({ ok: true, message: `${x.id} importé (${texte.length.toLocaleString("fr-FR")} caractères).` });
      }
    } catch (e) {
      const msg = e instanceof ImportError ? e.message : `Import impossible : ${(e as Error).message}`;
      await journaliserErreur("import", `${x.id} — ${entree.meta.url} — ${msg}`, a.compte.profil.id);
      return Response.json({ error: `${x.id} : ${msg}` }, { status: 502 });
    }
  } else if (x.action === "supprimer") r = await db.from("base_documents").delete().eq("id", x.id);
  else if (x.action === "modifier") {
    const { action: _a, id, ...patch } = x;
    r = await db.from("base_documents").update({ ...patch, maj_le: maintenant }).eq("id", id);
  } else {
    const { action: _a, ...doc } = x;
    r = await db.from("base_documents").upsert({ ...doc, texte: doc.texte.replace(/\u0000/g, ""), ajoute_par: a.compte.profil.id, maj_le: maintenant });
  }
  if (r.error) return Response.json({ error: `Enregistrement impossible : ${r.error.message}` }, { status: 500 });
  invaliderBaseEnLigne();
  return Response.json({ ok: true });
}
