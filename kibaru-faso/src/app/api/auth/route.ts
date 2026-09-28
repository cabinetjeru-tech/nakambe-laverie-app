import { z } from "zod";
import { traduire } from "@/lib/auth-messages";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { accountsEnabled, sessionClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Connexion, inscription et mot de passe, traités par le serveur de l'application.
 * Le navigateur de l'enseignant ne contacte jamais Supabase directement : certains réseaux mobiles
 * n'atteignent pas le domaine de Supabase, alors qu'ils atteignent le site. La session est posée en cookie.
 */

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connexion"), email: z.email().max(200), password: z.string().min(1).max(200) }),
  z.object({ action: z.literal("inscription"), email: z.email().max(200), password: z.string().min(8).max(200), nom: z.string().trim().max(120).optional() }),
  z.object({ action: z.literal("oubli"), email: z.email().max(200) }),
  z.object({ action: z.literal("nouveau"), password: z.string().min(8).max(200) }),
  z.object({ action: z.literal("deconnexion") }),
]);

function origin(req: Request): string {
  return process.env.APP_URL?.replace(/\/$/, "") || new URL(req.url).origin;
}

export async function POST(req: Request) {
  if (!accountsEnabled()) return Response.json({ error: "Comptes non configurés." }, { status: 404 });
  const rl = rateLimit(`auth:${clientIp(req)}`, 12, 10 * 60_000);
  if (!rl.ok) return Response.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const pw = parsed.error.issues.some((i) => i.path[0] === "password");
    return Response.json({ error: pw ? "Mot de passe trop court : au moins 8 caractères." : "Adresse e-mail invalide." }, { status: 400 });
  }
  const x = parsed.data;
  const sb = await sessionClient();
  const callback = `${origin(req)}/auth/callback`;
  try {
    switch (x.action) {
      case "connexion": {
        const { error } = await sb.auth.signInWithPassword({ email: x.email.trim(), password: x.password });
        if (error) throw error;
        return Response.json({ ok: true });
      }
      case "inscription": {
        const { data, error } = await sb.auth.signUp({ email: x.email.trim(), password: x.password, options: { data: { nom: x.nom ?? "" }, emailRedirectTo: callback } });
        if (error) throw error;
        return Response.json({ ok: true, session: !!data.session });
      }
      case "oubli": {
        const { error } = await sb.auth.resetPasswordForEmail(x.email.trim(), { redirectTo: `${callback}?next=${encodeURIComponent("/?reinit=1")}` });
        if (error) throw error;
        return Response.json({ ok: true });
      }
      case "nouveau": {
        const { error } = await sb.auth.updateUser({ password: x.password });
        if (error) throw error;
        return Response.json({ ok: true });
      }
      case "deconnexion":
        await sb.auth.signOut();
        return Response.json({ ok: true });
    }
  } catch (e) {
    const message = (e as Error).message ?? "";
    console.error("[auth]", x.action, message);
    return Response.json({ error: traduire(message) }, { status: 400 });
  }
}
