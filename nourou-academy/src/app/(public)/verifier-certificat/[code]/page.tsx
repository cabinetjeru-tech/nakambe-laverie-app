import type { Metadata } from "next";
import Link from "next/link";
import { BadgeCheck, ShieldX } from "lucide-react";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { Card, CardBody, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Vérification de certificat", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function VerifyCertificate({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [brand, ip] = await Promise.all([getBrand(), clientIp()]);
  const limited = !rateLimit(`verify:${ip}`, 60, 60_000).ok;
  const cert = limited ? null : await prisma.certificate.findUnique({ where: { code: decodeURIComponent(code).toUpperCase() } });
  const valid = cert?.status === "VALID";
  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      <Card>
        <CardBody className="py-10 text-center">
          {limited ? (
            <p className="text-sm text-muted">Trop de vérifications. Réessayez dans une minute.</p>
          ) : valid && cert ? (
            <>
              <BadgeCheck className="mx-auto h-14 w-14 text-emerald-600" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold text-navy">Certificat authentique</h1>
              <dl className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
                <div className="flex justify-between gap-4"><dt className="text-muted">Titulaire</dt><dd className="font-semibold text-navy">{cert.learnerName}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Formation</dt><dd className="text-right font-semibold text-navy">{cert.courseTitle}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Délivré le</dt><dd>{formatDate(cert.issuedAt)}</dd></div>
                {cert.score !== null && <div className="flex justify-between gap-4"><dt className="text-muted">Examen final</dt><dd>{cert.score} %</dd></div>}
                <div className="flex justify-between gap-4"><dt className="text-muted">Identifiant</dt><dd className="font-mono">{cert.code}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Délivré par</dt><dd className="text-right">{brand.name}</dd></div>
              </dl>
              <a href={`/api/certificats/${cert.code}/pdf`} className={buttonClass("outline", "md", "mt-6")}>Voir le certificat (PDF)</a>
              <p className="mt-6 text-xs text-muted">Ce certificat atteste d'une formation professionnelle suivie et validée auprès de {brand.name}. Il ne constitue pas un diplôme d'État.</p>
            </>
          ) : (
            <>
              <ShieldX className="mx-auto h-14 w-14 text-red-600" aria-hidden />
              <h1 className="mt-4 text-2xl font-bold text-navy">{cert?.status === "REVOKED" ? "Certificat révoqué" : "Certificat introuvable"}</h1>
              <p className="mt-2 text-sm text-muted">{cert?.status === "REVOKED" ? "Ce certificat a été révoqué par l'académie et n'est plus valide." : "Aucun certificat valide ne correspond à cet identifiant. Vérifiez la saisie."}</p>
              <Link href="/verifier-certificat" className={buttonClass("outline", "md", "mt-6")}>Nouvelle vérification</Link>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
