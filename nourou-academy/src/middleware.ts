import { NextResponse, type NextRequest } from "next/server";

/**
 * Filtre rapide en périphérie : redirige vers la connexion si aucun cookie de session
 * n'est présent sur les espaces privés. Le contrôle d'accès réel (session valide, rôle,
 * droits sur la formation) est TOUJOURS refait côté serveur dans chaque page et action.
 */
const PRIVATE = ["/espace", "/formateur", "/admin", "/paiement/commande"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("nga_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = `?suivant=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  if (pathname.startsWith("/admin") || pathname.startsWith("/formateur")) res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

export const config = { matcher: ["/espace/:path*", "/formateur/:path*", "/admin/:path*", "/paiement/commande"] };
