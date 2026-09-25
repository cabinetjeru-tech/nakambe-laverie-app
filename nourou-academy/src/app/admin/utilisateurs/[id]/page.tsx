import Link from "next/link";
import { notFound } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatXof, roleLabels } from "@/lib/format";
import { grantAccessAction, revokeAccessAction, updateUserAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, Field, PageHeader, Select, Table, Td, Th, buttonClass } from "@/components/ui";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = await requirePermission("users.view");
  const u = await prisma.user.findUnique({
    where: { id },
    include: {
      enrollments: { include: { course: { select: { title: true } } }, orderBy: { createdAt: "desc" } },
      orders: { orderBy: { createdAt: "desc" }, take: 20 },
      certificates: true,
      _count: { select: { tutorConversations: true, quizAttempts: true, submissions: true } },
    },
  });
  if (!u) notFound();
  const manage = can(admin.role, "users.manage");
  const courses = manage ? await prisma.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true }, orderBy: { title: "asc" } }) : [];
  const roles: Role[] = admin.role === "SUPERADMIN" ? ["SUPERADMIN", "ADMIN", "TRAINER", "ASSISTANT", "LEARNER"] : ["TRAINER", "ASSISTANT", "LEARNER"];
  return (
    <>
      <PageHeader title={u.name} subtitle={`${u.email}${u.phone ? ` · ${u.phone}` : ""} · inscrit le ${formatDate(u.createdAt)} · dernière connexion ${formatDateTime(u.lastLoginAt)}`} actions={<Link href="/admin/utilisateurs" className={buttonClass("outline")}>← Retour</Link>} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Table>
            <thead><tr><Th>Formation</Th><Th>Accès</Th><Th>Progression</Th><Th></Th></tr></thead>
            <tbody>
              {u.enrollments.length === 0 && <tr><Td colSpan={4} className="text-center text-muted">Aucune inscription.</Td></tr>}
              {u.enrollments.map((e) => (
                <tr key={e.id}>
                  <Td>{e.course.title}</Td>
                  <Td><Badge tone={e.status === "ACTIVE" ? "green" : "gray"}>{e.source} · {e.status}</Badge></Td>
                  <Td>{e.progressPercent} %</Td>
                  <Td>{manage && e.status === "ACTIVE" && <form action={revokeAccessAction.bind(null, e.id)}><SubmitButton size="sm" variant="ghost" confirm="Retirer cet accès ?">Retirer</SubmitButton></form>}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Table>
            <thead><tr><Th>Commande</Th><Th>Article</Th><Th>Montant</Th><Th>Statut</Th></tr></thead>
            <tbody>
              {u.orders.length === 0 && <tr><Td colSpan={4} className="text-center text-muted">Aucune commande.</Td></tr>}
              {u.orders.map((o) => <tr key={o.id}><Td className="font-mono text-xs">{o.reference}</Td><Td>{o.itemLabel}</Td><Td>{formatXof(o.totalXof)}</Td><Td><Badge tone={o.status === "PAID" ? "green" : "gray"}>{o.status}{o.mode === "DEMO" ? " (démo)" : ""}</Badge></Td></tr>)}
            </tbody>
          </Table>
          <p className="text-xs text-muted">{u._count.tutorConversations} conversation(s) avec le tuteur (contenu privé, non affiché) · {u._count.quizAttempts} quiz · {u._count.submissions} devoir(s) · {u.certificates.length} certificat(s)</p>
        </div>
        {manage && (
          <div className="space-y-4">
            <Card><CardBody>
              <ActionForm action={updateUserAction} className="space-y-3">
                <input type="hidden" name="userId" value={u.id} />
                <Field label="Rôle"><Select name="role" defaultValue={u.role}>{(roles.includes(u.role) ? roles : [u.role, ...roles]).map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}</Select></Field>
                <Field label="Statut"><Select name="status" defaultValue={u.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"}><option value="ACTIVE">Actif</option><option value="SUSPENDED">Suspendu</option></Select></Field>
                <SubmitButton>Enregistrer</SubmitButton>
              </ActionForm>
            </CardBody></Card>
            <Card><CardBody>
              <ActionForm action={grantAccessAction} className="space-y-3">
                <input type="hidden" name="userId" value={u.id} />
                <Field label="Offrir l'accès à une formation"><Select name="courseId">{courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}</Select></Field>
                <SubmitButton variant="outline">Attribuer l'accès</SubmitButton>
              </ActionForm>
            </CardBody></Card>
          </div>
        )}
      </div>
    </>
  );
}
