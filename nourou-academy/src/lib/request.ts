import { headers } from "next/headers";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown").slice(0, 64);
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") || "").slice(0, 300);
}
