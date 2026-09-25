import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock, ShieldCheck, Tag } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { quote } from "@/lib/payments/checkout";
import { availableProviders } from "@/lib/payments/registry";
import { formatXof } from "@/lib/format";
import { checkoutAction } from "@/app/actions/payments";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, Card, CardBody, Input, buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Finaliser ma commande" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ type?: string; id?: string; slug?: string; code?: string }> }) {
  const sp = await searchParams;
  const nextUrl = `/paiement/commande?${new URLSearchParams(sp as Record<string, string>).toString()}`;
  const user = await requireUser(nextUrl);
  const type = sp.type === "PACK" ? "PACK" : sp.type === "PLAN" ? "PLAN" : "COURSE";
  let id = sp.id;
  if (!id && sp.slug) {
    id = type === "PACK" ? (await prisma.pack.findUnique({ where: { slug: sp.slug } }))?.id : type === "PLAN" ? (await prisma.plan.findUnique({ where: { code: sp.slug } }))?.id : (await prisma.course.findUnique({ where: { slug: sp.slug } }))?.id;
  }
  if (!id) notFound();
  if (type === "COURSE") {
    const enr = await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: id } }, include: { course: true } });
    if (enr?.status === "ACTIVE") redirect(`/espace/apprendre/${enr.course.slug}`);
  }
  let q;
  try {
    q = await quote(user.id, { type, id }, sp.code);
  } catch {
    notFound();
  }
  const providers = await availableProviders();
  const packCourses = type === "PACK" ? await prisma.packCourse.findMany({ where: { packId: id }, include: { course: { select: { title: true } } } }) : [];

  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_360px]">
      <div>
        <h1 className="text-2xl font-bold text-navy">Finaliser ma commande</h1>
        <p className="mt-1 text-sm text-muted">Paiement sécurisé : vos droits d'accès sont activés dès la confirmation du paiement par le prestataire.</p>
        {q.total === 0 ? (
          <Card className="mt-6"><CardBody>
            <p className="text-sm">Aucun paiement n'est nécessaire pour cette commande.</p>
            <ActionForm action={checkoutAction} className="mt-4">
              <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} /><input type="hidden" name="coupon" value={sp.code ?? ""} /><input type="hidden" name="provider" value="none" />
              <SubmitButton variant="accent" size="lg">Activer mon accès</SubmitButton>
            </ActionForm>
          </CardBody></Card>
        ) : providers.length === 0 ? (
          <Alert tone="warning" className="mt-6">
            Le paiement en ligne n'est pas encore activé sur la plateforme. Contactez-nous pour régler votre formation : <Link href="/contact" className="font-semibold underline">page contact</Link>.
          </Alert>
        ) : (
          <ActionForm action={checkoutAction} className="mt-6 space-y-4">
            <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} /><input type="hidden" name="coupon" value={sp.code ?? ""} />
            <fieldset className="space-y-3">
              <legend className="mb-2 font-semibold text-navy">Moyen de paiement</legend>
              {providers.map((p, i) => (
                <label key={p.id} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-white p-4 has-[:checked]:border-sky has-[:checked]:ring-2 has-[:checked]:ring-sky/20">
                  <input type="radio" name="provider" value={p.id} defaultChecked={i === 0} className="mt-1" />
                  <span>
                    <span className="block font-semibold text-navy">{p.label}</span>
                    <span className="block text-sm text-muted">{p.description}</span>
                    {p.id === "demo" && <span className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Mode démonstration — aucun débit réel</span>}
                  </span>
                </label>
              ))}
            </fieldset>
            <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Redirection vers le paiement…"><Lock className="h-4 w-4" /> Payer {formatXof(q.total)}</SubmitButton>
            <p className="flex items-center gap-2 text-xs text-muted"><ShieldCheck className="h-4 w-4 text-emerald-600" /> Vous serez redirigé vers la page sécurisée du prestataire. Nous ne stockons jamais vos codes Mobile Money ni vos données de carte.</p>
          </ActionForm>
        )}
      </div>

      <aside>
        <Card>
          <CardBody className="space-y-3">
            <div className="text-sm font-semibold uppercase tracking-wide text-muted">Récapitulatif</div>
            <div className="font-semibold text-navy">{q.label}</div>
            {packCourses.length > 0 && <ul className="list-disc pl-5 text-sm text-muted">{packCourses.map((pc) => <li key={pc.courseId}>{pc.course.title}</li>)}</ul>}
            <div className="space-y-1 border-t border-line pt-3 text-sm">
              <div className="flex justify-between"><span>Prix</span><span>{formatXof(q.subtotal)}</span></div>
              {q.discount > 0 && <div className="flex justify-between text-emerald-700"><span>Remise</span><span>− {formatXof(q.discount)}</span></div>}
              <div className="flex justify-between pt-1 text-lg font-bold text-navy"><span>Total</span><span>{formatXof(q.total)}</span></div>
            </div>
            <form className="flex gap-2 border-t border-line pt-3">
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="id" value={id} />
              <label className="sr-only" htmlFor="code">Code promotionnel</label>
              <Input id="code" name="code" defaultValue={sp.code ?? ""} placeholder="Code promo" className="uppercase" />
              <button className={buttonClass("outline", "md")}><Tag className="h-4 w-4" /> Appliquer</button>
            </form>
            {sp.code && q.couponError && <p className="text-xs text-red-600">{q.couponError}</p>}
            {sp.code && !q.couponError && q.discount > 0 && <p className="text-xs text-emerald-700">Code « {sp.code.toUpperCase()} » appliqué.</p>}
          </CardBody>
        </Card>
      </aside>
    </div>
  );
}
