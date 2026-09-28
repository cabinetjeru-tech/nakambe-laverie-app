import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Accès par code partagé (variable KIBARU_ACCESS_CODE). Sans code configuré, l'accès est libre.
 * Le cookie contient une signature HMAC du code : changer le code déconnecte tout le monde.
 */

export const ACCESS_COOKIE = "kibaru_acces";

function secret(): string {
  return process.env.KIBARU_SESSION_SECRET || process.env.ANTHROPIC_API_KEY || "kibaru-dev";
}

export function accessRequired(): boolean {
  return !!process.env.KIBARU_ACCESS_CODE;
}

export function tokenFor(code: string): string {
  return createHmac("sha256", secret()).update(`acces:${code}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function checkCode(code: string): boolean {
  const expected = process.env.KIBARU_ACCESS_CODE;
  if (!expected) return true;
  return safeEqual(code.trim(), expected);
}

export function hasAccess(req: Request): boolean {
  const expected = process.env.KIBARU_ACCESS_CODE;
  if (!expected) return true;
  const cookie = req.headers.get("cookie") ?? "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${ACCESS_COOKIE}=([^;]+)`));
  return !!m && safeEqual(decodeURIComponent(m[1]!), tokenFor(expected));
}
