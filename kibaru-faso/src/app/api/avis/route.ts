import { z } from "zod";
import { compteCourant } from "@/lib/comptes";
import { accountsEnabled, adminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Avis de l'enseignant connecté (un par compte), publié sur la page de présentation après relecture par l'administration. */
export async function GET() {
  if (!accountsEnabled()) return Response.json({ avis: null });
  const compte = await compteCourant();
  if (!compte) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  const { data } = await adminClient().from("temoignages").select("texte, note, fonction, ville, publie").eq("utilisateur_id", compte.profil.id).maybeSingle();
  return Response.json({ avis: data ?? null });
}

const schema = z.object({
  texte: z.string().trim().min(10, "Votre avis est trop court (10 caractères au moins).").max(600, "Votre avis est trop long (600 caractères au plus)."),
  note: z.number().int().min(1).max(5),
  fonction: z.string().trim().max(80).optional(),
});

export async function POST(req: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Comptes non configurés." }, { status: 404 });
  const compte = await compteCourant();
  if (!compte) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  if (compte.profil.suspendu) return Response.json({ error: "Votre compte est suspendu." }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Avis invalide." }, { status: 400 });
  const p = compte.profil;
  // Nom affiché : prénom et initiale du nom (« Awa T. »), pour la vie privée de l'enseignant.
  const mots = (p.nom ?? "").trim().split(/\s+/).filter(Boolean);
  const nom = mots.length > 1 ? `${mots.slice(0, -1).join(" ")} ${mots[mots.length - 1]!.charAt(0).toUpperCase()}.` : mots[0] || "Un enseignant";
  const { error } = await adminClient()
    .from("temoignages")
    .upsert(
      { utilisateur_id: p.id, nom, fonction: parsed.data.fonction || null, ville: p.ville, texte: parsed.data.texte, note: parsed.data.note, publie: false },
      { onConflict: "utilisateur_id" },
    );
  if (error) return Response.json({ error: "Enregistrement impossible." }, { status: 500 });
  return Response.json({ ok: true });
}
