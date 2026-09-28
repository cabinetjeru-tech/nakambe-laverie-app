import { traiterPaiement } from "@/lib/comptes";
import { accountsEnabled } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** CinetPay vérifie que l'adresse de notification répond. */
export function GET() {
  return new Response("OK");
}

/**
 * Notification de CinetPay après un paiement. Le contenu n'est pas cru : seul l'identifiant de transaction est
 * utilisé, et le statut est revérifié auprès de l'API CinetPay avant toute activation.
 */
export async function POST(req: Request) {
  if (!accountsEnabled()) return new Response("OK");
  const type = req.headers.get("content-type") ?? "";
  let tx: string | undefined;
  if (type.includes("application/json")) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    tx = String(b.cpm_trans_id ?? b.transaction_id ?? "");
  } else {
    const f = await req.formData().catch(() => null);
    tx = String(f?.get("cpm_trans_id") ?? f?.get("transaction_id") ?? "");
  }
  if (tx && /^[A-Za-z0-9_-]{6,64}$/.test(tx)) {
    try {
      const r = await traiterPaiement(tx);
      console.log("[paiement] notification", tx, r.statut);
    } catch (e) {
      console.error("[paiement] notification", tx, (e as Error).message);
      return new Response("Erreur", { status: 500 });
    }
  }
  return new Response("OK");
}
