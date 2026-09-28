import { NextResponse } from "next/server";
import { sessionClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retour des liens envoyés par e-mail (confirmation d'inscription, mot de passe oublié) :
 * le code est échangé contre une session, puis l'enseignant revient dans l'application.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  // Redirection interne uniquement (pas de « //site » ni de « /\site », interprétés comme un autre domaine).
  const target = new URL(/^\/(?![/\\])/.test(next) && !next.includes("\\") ? next : "/", url.origin);
  if (target.origin !== url.origin) target.href = `${url.origin}/`;
  if (code) {
    const { error } = await (await sessionClient()).auth.exchangeCodeForSession(code);
    if (error) target.searchParams.set("erreur_lien", "1");
  }
  return NextResponse.redirect(target, 303);
}
