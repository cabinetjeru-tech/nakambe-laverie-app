import Link from "next/link";
import { Award, CheckCircle2, Download, ExternalLink, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { checkEligibility } from "@/lib/certificates/eligibility";
import { learnerRecord } from "@/lib/certificates/issue";
import { checkCertificateAction } from "@/app/actions/learning";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, EmptyState, PageHeader, buttonClass } from "@/components/ui";

export const metadata = { title: "Mes certificats" };

export default async function CertificatesPage() {
  const user = await requireUser();
  const [certs, enrollments] = await Promise.all([
    prisma.certificate.findMany({ where: { userId: user.id }, orderBy: { issuedAt: "desc" } }),
    prisma.enrollment.findMany({ where: { userId: user.id, status: "ACTIVE", course: { hasCertificate: true } }, include: { course: true } }),
  ]);
  const certified = new Set(certs.map((c) => c.courseId));
  const pending = await Promise.all(
    enrollments.filter((e) => !certified.has(e.courseId)).map(async (e) => ({ e, result: checkEligibility(e.course, await learnerRecord(user.id, e.courseId)) })),
  );
  return (
    <>
      <PageHeader title="Mes certificats" subtitle="Certificats numériques vérifiables par QR code. Ils attestent d'une formation suivie et validée ; ce ne sont pas des diplômes d'État." />
      {certs.length === 0 ? (
        <EmptyState icon={<Award className="h-6 w-6" />} title="Pas encore de certificat" text="Terminez une formation en remplissant ses critères pour obtenir votre premier certificat." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {certs.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="h-1.5 bg-accent" />
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-navy">{c.courseTitle}</div>
                    <div className="text-xs text-muted">Délivré le {formatDate(c.issuedAt)} · ID {c.code}</div>
                  </div>
                  {c.status === "VALID" ? <Badge tone="green">Valide</Badge> : c.status === "PENDING_APPROVAL" ? <Badge tone="amber">En validation</Badge> : <Badge tone="red">Révoqué</Badge>}
                </div>
                {c.status === "VALID" && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a href={`/api/certificats/${c.code}/pdf`} className={buttonClass("primary", "sm")}><Download className="h-4 w-4" /> Télécharger (PDF)</a>
                    <Link href={`/verifier-certificat/${c.code}`} className={buttonClass("outline", "sm")}><ExternalLink className="h-4 w-4" /> Page de vérification</Link>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold text-navy">Certificats en préparation</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {pending.map(({ e, result }) => (
              <Card key={e.id}>
                <CardBody>
                  <div className="font-semibold text-navy">{e.course.title}</div>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {result.checks.map((ch) => (
                      <li key={ch.label} className="flex items-start gap-2">
                        {ch.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                        <span><b>{ch.label}</b> — {ch.detail}</span>
                      </li>
                    ))}
                  </ul>
                  {result.eligible && (
                    <form action={checkCertificateAction.bind(null, e.courseId)} className="mt-3"><SubmitButton size="sm" variant="accent">Obtenir mon certificat</SubmitButton></form>
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
