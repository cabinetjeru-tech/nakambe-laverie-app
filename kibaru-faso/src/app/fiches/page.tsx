import type { Metadata } from "next";
import { AppelEssai, EntetePublic } from "@/components/entete-public";
import { fichesPubliees } from "@/lib/vitrine-serveur";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Fiches pédagogiques gratuites — 6e à Terminale | PÉDAGOGUE.IA",
  description: "Fiches de cours, devoirs et corrigés gratuits pour les enseignants du secondaire au Burkina Faso, de la 6e à la Terminale.",
  alternates: { canonical: "/fiches" },
};

export default async function Fiches({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const toutes = await fichesPubliees();
  const classe = typeof q.classe === "string" ? q.classe : "";
  const discipline = typeof q.discipline === "string" ? q.discipline : "";
  const classes = [...new Set(toutes.map((f) => f.classe).filter(Boolean))] as string[];
  const disciplines = [...new Set(toutes.map((f) => f.discipline).filter(Boolean))].sort() as string[];
  const liste = toutes.filter((f) => (!classe || f.classe === classe) && (!discipline || f.discipline === discipline));
  const lien = (c: string, d: string) => {
    const p = new URLSearchParams({ ...(c ? { classe: c } : {}), ...(d ? { discipline: d } : {}) }).toString();
    return p ? `/fiches?${p}` : "/fiches";
  };
  const puce = (actif: boolean) => `rounded-full border px-3 py-1 text-sm ${actif ? "border-faso bg-faso text-white" : "border-line bg-white hover:border-faso"}`;

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <EntetePublic />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-extrabold text-faso-dark sm:text-3xl">Fiches pédagogiques gratuites</h1>
        <p className="mt-2 max-w-2xl text-muted">Des exemples de préparations réalisées avec PÉDAGOGUE.IA, à consulter et à adapter librement pour vos classes.</p>

        {toutes.length > 0 && (
          <div className="mt-5 space-y-2">
            <div className="flex flex-wrap gap-2">
              <a href={lien("", discipline)} className={puce(!classe)}>
                Toutes les classes
              </a>
              {classes.map((c) => (
                <a key={c} href={lien(c, discipline)} className={puce(classe === c)}>
                  {c}
                </a>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={lien(classe, "")} className={puce(!discipline)}>
                Toutes les disciplines
              </a>
              {disciplines.map((d) => (
                <a key={d} href={lien(classe, d)} className={puce(discipline === d)}>
                  {d}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {liste.map((f) => (
            <a key={f.slug} href={`/fiches/${f.slug}`} className="rounded-2xl border border-line bg-white p-4 transition hover:border-faso hover:shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-wide text-faso">{[f.discipline, f.classe].filter(Boolean).join(" · ") || "Fiche"}</div>
              <h2 className="mt-1 font-bold text-faso-dark">{f.titre}</h2>
              {f.resume && <p className="mt-1 line-clamp-3 text-sm text-muted">{f.resume}</p>}
            </a>
          ))}
        </div>
        {liste.length === 0 && <p className="mt-6 rounded-xl border border-line bg-white p-5 text-muted">Les premières fiches arrivent bientôt. En attendant, préparez la vôtre gratuitement !</p>}

        <div className="mt-10">
          <AppelEssai />
        </div>
      </main>
    </div>
  );
}
