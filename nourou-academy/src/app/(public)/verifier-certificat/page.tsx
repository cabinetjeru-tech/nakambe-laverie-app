import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Card, CardBody, Input, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Vérifier un certificat" };

export default async function VerifyForm({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  if (code?.trim()) redirect(`/verifier-certificat/${encodeURIComponent(code.trim().toUpperCase())}`);
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <Card>
        <CardBody className="text-center">
          <ShieldCheck className="mx-auto h-12 w-12 text-sky" aria-hidden />
          <h1 className="mt-3 text-2xl font-bold text-navy">Vérifier un certificat</h1>
          <p className="mt-1 text-sm text-muted">Saisissez l'identifiant figurant sur le certificat (ex. NGA-2026-ABCDE-FGHJK) ou scannez son QR code.</p>
          <form className="mt-6 flex gap-2">
            <Input name="code" required placeholder="NGA-…" className="uppercase" aria-label="Identifiant du certificat" />
            <button className={buttonClass("primary")}>Vérifier</button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
