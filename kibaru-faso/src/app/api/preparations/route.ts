import { z } from "zod";
import { utilisateurCourant } from "@/lib/comptes";
import { accountsEnabled, adminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Préparations de l'enseignant connecté, sauvegardées en ligne : il les retrouve sur tous ses appareils. */

const MAX_BYTES = 2_000_000;

async function qui() {
  if (!accountsEnabled()) return null;
  return utilisateurCourant().catch(() => null);
}

export async function GET() {
  const user = await qui();
  if (!user) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  const { data, error } = await adminClient()
    .from("preparations")
    .select("contenu")
    .eq("utilisateur_id", user.id)
    .order("maj_le", { ascending: false })
    .limit(300);
  if (error) return Response.json({ error: "Chargement impossible." }, { status: 500 });
  return Response.json({ conversations: (data ?? []).map((r) => r.contenu) });
}

const conversationSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(300),
  category: z.string().max(40).optional(),
  updatedAt: z.number(),
  messages: z.array(z.record(z.string(), z.unknown())).max(400),
});

export async function PUT(req: Request) {
  const user = await qui();
  if (!user) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return Response.json({ error: "Préparation trop volumineuse." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = conversationSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Préparation invalide." }, { status: 400 });
  const c = parsed.data;
  const { error } = await adminClient()
    .from("preparations")
    .upsert({ id: c.id, utilisateur_id: user.id, titre: c.title, categorie: c.category ?? null, contenu: c, maj_le: new Date(c.updatedAt).toISOString() });
  if (error) return Response.json({ error: "Sauvegarde impossible." }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await qui();
  if (!user) return Response.json({ error: "Connectez-vous." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || id.length > 80) return Response.json({ error: "Identifiant invalide." }, { status: 400 });
  await adminClient().from("preparations").delete().eq("utilisateur_id", user.id).eq("id", id);
  return Response.json({ ok: true });
}
