import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { formatDate, formatXof } from "@/lib/format";
import { saveCouponAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, Checkbox, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/ui";

export const metadata = { title: "Codes promotionnels" };

export default async function CouponsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const { edit } = await searchParams;
  await requirePermission("coupons.manage");
  const [coupons, courses] = await Promise.all([
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, include: { course: { select: { title: true } } } }),
    prisma.course.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true } }),
  ]);
  const c = coupons.find((x) => x.id === edit);
  const d = (v: Date | null | undefined) => (v ? v.toISOString().slice(0, 10) : "");
  return (
    <>
      <PageHeader title="Codes promotionnels et coupons" />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Table>
          <thead><tr><Th>Code</Th><Th>Remise</Th><Th>Utilisations</Th><Th>Validité</Th><Th>Portée</Th><Th>État</Th></tr></thead>
          <tbody>
            {coupons.map((x) => (
              <tr key={x.id}>
                <Td><a href={`?edit=${x.id}`} className="font-mono font-semibold text-navy hover:text-sky">{x.code}</a><div className="text-xs text-muted">{x.description}</div></Td>
                <Td>{x.type === "PERCENT" ? `${x.value} %` : formatXof(x.value)}</Td>
                <Td>{x.usedCount}{x.maxUses ? ` / ${x.maxUses}` : ""}</Td>
                <Td className="text-xs text-muted">{x.validFrom ? formatDate(x.validFrom) : "—"} → {x.validUntil ? formatDate(x.validUntil) : "∞"}</Td>
                <Td className="text-xs">{x.course?.title ?? "Tout"}</Td>
                <Td><Badge tone={x.active ? "green" : "gray"}>{x.active ? "Actif" : "Inactif"}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Card><CardBody>
          <h2 className="mb-3 font-semibold text-navy">{c ? `Modifier ${c.code}` : "Nouveau code"}</h2>
          <ActionForm action={saveCouponAction} className="space-y-3" resetOnSuccess={!c}>
            <input type="hidden" name="id" value={c?.id ?? ""} />
            <Field label="Code"><Input name="code" defaultValue={c?.code} required className="uppercase" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><Select name="type" defaultValue={c?.type ?? "PERCENT"}><option value="PERCENT">Pourcentage</option><option value="FIXED">Montant fixe (FCFA)</option></Select></Field>
              <Field label="Valeur"><Input name="value" type="number" min={1} defaultValue={c?.value} required /></Field>
              <Field label="Utilisations max"><Input name="maxUses" type="number" min={1} defaultValue={c?.maxUses ?? ""} placeholder="illimité" /></Field>
              <Field label="Par utilisateur"><Input name="perUserLimit" type="number" min={0} defaultValue={c?.perUserLimit ?? 1} /></Field>
              <Field label="Début"><Input name="validFrom" type="date" defaultValue={d(c?.validFrom)} /></Field>
              <Field label="Fin"><Input name="validUntil" type="date" defaultValue={d(c?.validUntil)} /></Field>
            </div>
            <Field label="Montant minimum (FCFA)"><Input name="minAmountXof" type="number" min={0} defaultValue={c?.minAmountXof ?? 0} /></Field>
            <Field label="Limité à une formation"><Select name="courseId" defaultValue={c?.courseId ?? ""}><option value="">Toutes les offres</option>{courses.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</Select></Field>
            <Field label="Description interne"><Input name="description" defaultValue={c?.description ?? ""} /></Field>
            <Checkbox name="active" defaultChecked={c?.active ?? true} label="Actif" />
            <SubmitButton>{c ? "Enregistrer" : "Créer"}</SubmitButton>
          </ActionForm>
        </CardBody></Card>
      </div>
    </>
  );
}
