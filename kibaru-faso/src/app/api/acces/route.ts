import { ACCESS_COOKIE, accessRequired, checkCode, hasAccess, tokenFor } from "@/lib/access";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** État de l'accès : l'interface demande le code uniquement s'il est requis. */
export async function GET(req: Request) {
  return Response.json({ required: accessRequired(), granted: hasAccess(req) });
}

export async function POST(req: Request) {
  const rl = rateLimit(`acces:${clientIp(req)}`, 8, 10 * 60_000);
  if (!rl.ok) return Response.json({ error: `Trop d'essais. Réessayez dans ${Math.ceil(rl.retryAfter / 60)} min.` }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as { code?: unknown };
  const code = typeof body.code === "string" ? body.code : "";
  if (!accessRequired()) return Response.json({ ok: true });
  if (!checkCode(code)) return Response.json({ error: "Code d'accès incorrect." }, { status: 403 });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return Response.json(
    { ok: true },
    { headers: { "Set-Cookie": `${ACCESS_COOKIE}=${encodeURIComponent(tokenFor(code.trim()))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}` } },
  );
}
