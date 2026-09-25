import Link from "next/link";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate, roleLabels } from "@/lib/format";
import { createUserAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, Field, Input, PageHeader, Select, Table, Td, Th, buttonClass, inputClass } from "@/components/ui";

export const metadata = { title: "Utilisateurs" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; role?: string; page?: string }> }) {
  const sp = await searchParams;
  const admin = await requirePermission("users.view");
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.UserWhereInput = { status: { not: "DELETED" } };
  if (sp.q) where.OR = [{ name: { contains: sp.q, mode: "insensitive" } }, { email: { contains: sp.q, mode: "insensitive" } }, { phone: { contains: sp.q } }];
  if (sp.role && sp.role in roleLabels) where.role = sp.role as Role;
  const [users, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 30, take: 30, include: { _count: { select: { enrollments: true } } } }),
    prisma.user.count({ where }),
  ]);
  return (
    <>
      <PageHeader title="Utilisateurs & rôles" subtitle={`${total} compte(s) — rôles : super-administrateur, administrateur, formateur, assistant, apprenant.`} />
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <form className="flex flex-wrap gap-2">
            <input name="q" defaultValue={sp.q} placeholder="Nom, email, téléphone…" className={`${inputClass} h-10 max-w-xs`} />
            <select name="role" defaultValue={sp.role ?? ""} className={`${inputClass} h-10 max-w-48`}>
              <option value="">Tous les rôles</option>
              {Object.entries(roleLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className={buttonClass("outline")}>Filtrer</button>
          </form>
          <Table>
            <thead><tr><Th>Utilisateur</Th><Th>Rôle</Th><Th>Statut</Th><Th>Formations</Th><Th>Inscription</Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td><Link href={`/admin/utilisateurs/${u.id}`} className="font-medium text-navy hover:text-sky">{u.name}</Link><div className="text-xs text-muted">{u.email}{u.isDemo && " · démo"}</div></Td>
                  <Td><Badge tone={u.role === "LEARNER" ? "gray" : u.role === "TRAINER" ? "sky" : "navy"}>{roleLabels[u.role]}</Badge></Td>
                  <Td><Badge tone={u.status === "ACTIVE" ? "green" : "red"}>{u.status === "ACTIVE" ? "Actif" : "Suspendu"}</Badge></Td>
                  <Td>{u._count.enrollments}</Td>
                  <Td className="text-muted">{formatDate(u.createdAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex gap-2">
            {page > 1 && <Link href={`?${new URLSearchParams({ ...sp, page: String(page - 1) } as Record<string, string>)}`} className={buttonClass("outline", "sm")}>← Précédent</Link>}
            {page * 30 < total && <Link href={`?${new URLSearchParams({ ...sp, page: String(page + 1) } as Record<string, string>)}`} className={buttonClass("outline", "sm")}>Suivant →</Link>}
          </div>
        </div>
        {can(admin.role, "users.manage") && (
          <Card><CardBody>
            <h2 className="mb-3 font-semibold text-navy">Créer un compte</h2>
            <ActionForm action={createUserAction} className="space-y-3" resetOnSuccess>
              <Field label="Nom"><Input name="name" required /></Field>
              <Field label="Email"><Input name="email" type="email" required /></Field>
              <Field label="Rôle">
                <Select name="role" defaultValue="TRAINER">
                  {(["TRAINER", "ASSISTANT", "LEARNER", ...(admin.role === "SUPERADMIN" ? ["ADMIN", "SUPERADMIN"] : [])] as Role[]).map((r) => <option key={r} value={r}>{roleLabels[r]}</option>)}
                </Select>
              </Field>
              <SubmitButton>Créer et envoyer l'invitation</SubmitButton>
            </ActionForm>
          </CardBody></Card>
        )}
      </div>
    </>
  );
}
