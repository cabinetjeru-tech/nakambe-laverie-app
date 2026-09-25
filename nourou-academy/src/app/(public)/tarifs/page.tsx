import type { Metadata } from "next";
import Link from "next/link";
import { Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatXof } from "@/lib/format";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Tarifs et abonnements" };
export const dynamic = "force-dynamic";

const intervalLabel = { MONTH: "/ mois", QUARTER: "/ trimestre", YEAR: "/ an" };

export default async function PricingPage() {
  const [plans, packs, included] = await Promise.all([
    prisma.plan.findMany({ where: { active: true }, orderBy: { position: "asc" } }),
    prisma.pack.findMany({ where: { active: true }, include: { courses: { include: { course: { select: { title: true, priceXof: true, status: true } } } } } }),
    prisma.course.count({ where: { status: "PUBLISHED", includedInSubscription: true, isFree: false } }),
  ]);
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-navy sm:text-4xl">Des formules adaptées à chaque budget</h1>
        <p className="mx-auto mt-2 max-w-2xl text-muted">Achetez une formation à l'unité, économisez avec un pack, ou accédez à tout le catalogue inclus avec un abonnement. Paiement par Mobile Money ou carte.</p>
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-line bg-white p-8">
          <h2 className="text-lg font-bold text-navy">À l'unité</h2>
          <p className="mt-1 text-sm text-muted">Payez uniquement la formation qui vous intéresse, accès sans limite de durée.</p>
          <ul className="mt-6 space-y-2 text-sm">{["Accès à vie à la formation achetée", "Tuteur IA sur cette formation", "Certificat inclus", "Formations gratuites incluses"].map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-emerald-600" />{f}</li>)}</ul>
          <Link href="/formations" className={buttonClass("outline", "lg", "mt-8 w-full")}>Parcourir le catalogue</Link>
        </div>
        {plans.map((p, i) => (
          <div key={p.id} className={`relative rounded-3xl p-8 ${i === 1 ? "bg-navy text-white shadow-xl" : "border border-line bg-white"}`}>
            {i === 1 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-bold text-navy">Le plus choisi</span>}
            <h2 className={`text-lg font-bold ${i === 1 ? "text-white" : "text-navy"}`}>Abonnement {p.name.toLowerCase()}</h2>
            {p.description && <p className={`mt-1 text-sm ${i === 1 ? "text-slate-300" : "text-muted"}`}>{p.description}</p>}
            <div className="mt-4"><span className="text-4xl font-extrabold">{formatXof(p.priceXof)}</span> <span className={i === 1 ? "text-slate-300" : "text-muted"}>{intervalLabel[p.interval]}</span></div>
            <ul className="mt-6 space-y-2 text-sm">{p.features.map((f) => <li key={f} className="flex gap-2"><Check className={`h-4 w-4 ${i === 1 ? "text-accent" : "text-emerald-600"}`} />{f}</li>)}</ul>
            <Link href={`/paiement/commande?type=PLAN&id=${p.id}`} className={buttonClass(i === 1 ? "accent" : "primary", "lg", "mt-8 w-full")}>Choisir cette formule</Link>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-sm text-muted">{included} formation{included > 1 ? "s" : ""} payante{included > 1 ? "s" : ""} actuellement incluse{included > 1 ? "s" : ""} dans l'abonnement. Pas de reconduction automatique : vous renouvelez quand vous le souhaitez.</p>

      {packs.length > 0 && (
        <section className="mt-16">
          <h2 className="text-2xl font-bold text-navy">Packs de formations</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {packs.map((p) => {
              const full = p.courses.reduce((s, c) => s + c.course.priceXof, 0);
              return (
                <div key={p.id} className="rounded-2xl border border-line bg-white p-6">
                  <h3 className="text-lg font-semibold text-navy">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted">{p.description}</p>
                  <ul className="mt-3 list-disc pl-5 text-sm">{p.courses.map((c) => <li key={c.courseId}>{c.course.title}</li>)}</ul>
                  <div className="mt-4 flex items-end gap-3">
                    <span className="text-2xl font-extrabold text-navy">{formatXof(p.priceXof)}</span>
                    {full > p.priceXof && <span className="text-sm text-muted line-through">{formatXof(full)}</span>}
                  </div>
                  <Link href={`/paiement/commande?type=PACK&id=${p.id}`} className={buttonClass("accent", "md", "mt-4")}>Acheter ce pack</Link>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
