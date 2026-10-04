import { z } from "zod";
import { exigerAdmin } from "@/lib/garde-admin";
import { adminClient } from "@/lib/supabase/server";
import { whatsappConfigure } from "@/lib/whatsapp/envoi";
import { repondreCommeConseiller } from "@/lib/whatsapp/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Conversations du WhatsApp professionnel (espace admin) ; ?wa_id=… pour les messages d'une conversation. */
export async function GET(req: Request) {
  const a = await exigerAdmin();
  if (a.error) return a.error;
  const db = adminClient();
  const waId = new URL(req.url).searchParams.get("wa_id");
  const [{ data: contacts }, messages] = await Promise.all([
    db.from("whatsapp_contacts").select("*").order("a_traiter", { ascending: false }).order("dernier_message", { ascending: false }).limit(200),
    waId ? db.from("whatsapp_messages").select("id, sens, auteur, texte, cree_le").eq("wa_id", waId).order("cree_le", { ascending: true }).limit(300) : Promise.resolve({ data: null }),
  ]);
  const ids = (contacts ?? []).map((c) => c.wa_id as string);
  const { data: derniers } = ids.length
    ? await db.from("whatsapp_messages").select("wa_id, texte, auteur, cree_le").in("wa_id", ids).order("cree_le", { ascending: false }).limit(1000)
    : { data: [] };
  const apercu = new Map<string, { texte: string; auteur: string }>();
  for (const m of derniers ?? []) if (!apercu.has(m.wa_id as string)) apercu.set(m.wa_id as string, { texte: m.texte as string, auteur: m.auteur as string });
  return Response.json({
    config: whatsappConfigure(),
    webhook: `${(process.env.APP_URL?.trim() || new URL(req.url).origin).replace(/\/$/, "")}/api/whatsapp`,
    contacts: (contacts ?? []).map((c) => ({ ...c, apercu: apercu.get(c.wa_id as string) ?? null })),
    messages: messages.data ?? [],
  });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("repondre"), wa_id: z.string().regex(/^\d{6,20}$/), texte: z.string().trim().min(1).max(3500) }),
  z.object({ action: z.literal("ia"), wa_id: z.string().regex(/^\d{6,20}$/), active: z.boolean() }),
  z.object({ action: z.literal("traite"), wa_id: z.string().regex(/^\d{6,20}$/) }),
]);

export async function POST(req: Request) {
  const a = await exigerAdmin();
  if (a.error) return a.error;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Action invalide." }, { status: 400 });
  const x = parsed.data;
  const db = adminClient();
  if (x.action === "repondre") {
    try {
      await repondreCommeConseiller(x.wa_id, x.texte);
      return Response.json({ ok: true });
    } catch (e) {
      // Hors de la fenêtre de 24 h, Meta refuse les messages libres : répondre depuis l'application WhatsApp Business.
      return Response.json({ error: `Envoi refusé par WhatsApp : ${(e as Error).message}` }, { status: 502 });
    }
  }
  if (x.action === "ia") {
    await db.from("whatsapp_contacts").update({ ia_active: x.active, ...(x.active ? { a_traiter: false, motif: null } : {}) }).eq("wa_id", x.wa_id);
    return Response.json({ ok: true });
  }
  await db.from("whatsapp_contacts").update({ a_traiter: false }).eq("wa_id", x.wa_id);
  return Response.json({ ok: true });
}
