import "server-only";
import { NextResponse } from "next/server";
import { AuthError } from "./auth/session";

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status });
}

/** Encapsule un handler de route : erreurs d'authentification → 401/403, autres → 500 sans fuite de détail. */
export function handle<T extends unknown[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError) return jsonError(e.status, e.message);
      console.error("[api]", (e as Error).message);
      return jsonError(500, "Erreur interne. Réessayez dans un instant.");
    }
  };
}
