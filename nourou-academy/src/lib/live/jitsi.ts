import "server-only";
import { createHmac } from "node:crypto";
import { getSecret, getTechnicalSettings } from "../settings";

/**
 * Classes virtuelles via Jitsi Meet (partage d'écran, chat, lever la main intégrés).
 * - Par défaut : serveur public meet.jit.si (gratuit ; limites d'usage, enregistrement non garanti).
 * - Recommandé en production : Jitsi auto-hébergé ou JaaS (8x8) avec authentification JWT :
 *   renseigner le domaine, l'App ID et le secret (stocké chiffré côté serveur).
 */

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

export function signJitsiJwt(opts: { appId: string; secret: string; domain: string; room: string; user: { id: string; name: string; email: string }; moderator: boolean; ttlSeconds: number }) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    aud: "jitsi",
    iss: opts.appId,
    sub: opts.domain,
    room: opts.room,
    nbf: now - 10,
    exp: now + opts.ttlSeconds,
    context: { user: { id: opts.user.id, name: opts.user.name, email: opts.user.email, moderator: opts.moderator ? "true" : "false" } },
    moderator: opts.moderator,
  };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", opts.secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export async function jitsiJoinConfig(room: string, user: { id: string; name: string; email: string }, moderator: boolean) {
  const tech = await getTechnicalSettings();
  const domain = tech.jitsiDomain || "meet.jit.si";
  const secret = await getSecret("live.jitsiAppSecret");
  const jwt = tech.jitsiAppId && secret ? signJitsiJwt({ appId: tech.jitsiAppId, secret, domain, room, user, moderator, ttlSeconds: 4 * 3600 }) : null;
  return { domain, room, jwt, url: `https://${domain}/${encodeURIComponent(room)}${jwt ? `?jwt=${jwt}` : ""}` };
}

export function liveWindow(s: { startsAt: Date; durationMinutes: number }) {
  const start = s.startsAt.getTime();
  const end = start + s.durationMinutes * 60_000;
  const now = Date.now();
  return { canJoin: now >= start - 15 * 60_000 && now <= end + 30 * 60_000, isOver: now > end + 30 * 60_000, end: new Date(end) };
}
