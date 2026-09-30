import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppelEssai, EntetePublic } from "@/components/entete-public";
import { Markdown } from "@/components/markdown";
import { BoutonImprimer } from "@/components/bouton-imprimer";
import { compterVue, fichePubliee, fichesPubliees } from "@/lib/vitrine-serveur";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const f = await fichePubliee((await params).slug);
  if (!f) return { title: "Fiche introuvable — PÉDAGOGUE.IA" };
  const titre = `${f.titre}${f.classe ? ` (${f.classe})` : ""} — fiche gratuite | PÉDAGOGUE.IA`;
  const description = f.resume || `Fiche pédagogique ${[f.discipline, f.classe].filter(Boolean).join(", ")} : déroulement, trace écrite et évaluation.`;
  return { title: titre, description, alternates: { canonical: `/fiches/${f.slug}` }, openGraph: { title: titre, description, type: "article" } };
}

export default async function Fiche({ params }: Props) {
  const f = await fichePubliee((await params).slug);
  if (!f) notFound();
  await compterVue(f.slug).catch(() => undefined);
  const autres = (await fichesPubliees(40)).filter((x) => x.slug !== f.slug && (x.discipline === f.discipline || x.classe === f.classe)).slice(0, 4);

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <div className="print:hidden">
        <EntetePublic />
      </div>
      <main className="mx-auto max-w-3xl px-4 py-8">
        <nav className="text-sm text-muted print:hidden">
          <a href="/fiches" className="text-faso underline underline-offset-2">
            Fiches gratuites
          </a>
          {f.discipline && ` › ${f.discipline}`}
          {f.classe && ` › ${f.classe}`}
        </nav>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-extrabold text-faso-dark">{f.titre}</h1>
          <BoutonImprimer libelle="Imprimer" />
        </div>
        <article className="prose-kibaru mt-4 rounded-2xl border border-line bg-white p-4 sm:p-6">
          <Markdown text={f.contenu} />
        </article>
        <p className="mt-3 text-xs text-muted">
          Proposition générée avec PÉDAGOGUE.IA et relue par notre équipe. Vérifiez-la au regard du programme officiel en vigueur et adaptez-la à vos élèves.
        </p>
        <div className="mt-8 print:hidden">
          <AppelEssai titre="Adaptez cette fiche à votre classe en 2 minutes" />
        </div>
        {autres.length > 0 && (
          <section className="mt-8 print:hidden">
            <h2 className="font-bold text-faso-dark">Autres fiches</h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {autres.map((a) => (
                <li key={a.slug}>
                  <a href={`/fiches/${a.slug}`} className="block rounded-xl border border-line bg-white p-3 text-sm hover:border-faso">
                    <span className="block text-xs text-muted">{[a.discipline, a.classe].filter(Boolean).join(" · ")}</span>
                    <span className="font-semibold text-faso-dark">{a.titre}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
