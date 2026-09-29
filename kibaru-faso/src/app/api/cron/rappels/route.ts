import { envoyerRappels } from "@/lib/email/notifications";
import { accountsEnabled } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Tâche planifiée quotidienne (vercel.json → crons) : fin d'essai et fin d'abonnement proche. Protégée par CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Non autorisé." }, { status: 401 });
  if (!accountsEnabled()) return Response.json({ ok: true, ignore: "comptes non configurés" });
  const r = await envoyerRappels();
  console.log("[rappels]", r);
  return Response.json({ ok: true, ...r });
}
