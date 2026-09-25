import type { Metadata } from "next";
import Link from "next/link";
import { BookOpenCheck, Brain, FileSearch, Image as ImageIcon, Lock, Mic, Route, ShieldCheck, Sparkles, Target } from "lucide-react";
import { getBrand } from "@/lib/settings";
import { aiStatus } from "@/lib/ai/llm";
import { buttonClass } from "@/components/ui";

export const metadata: Metadata = { title: "Votre tuteur IA" };
export const dynamic = "force-dynamic";

export default async function TutorLanding() {
  const [brand, status] = await Promise.all([getBrand(), aiStatus()]);
  const features = [
    { i: Brain, t: "Enseignement personnalisé", d: "Explications étape par étape, adaptées à votre niveau (débutant, intermédiaire, avancé), reformulées autant de fois que nécessaire." },
    { i: BookOpenCheck, t: "Connecté à vos cours", d: "Il consulte les supports de vos formations (leçons, PDF, présentations) et cite précisément ses sources." },
    { i: ShieldCheck, t: "Honnête sur ses sources", d: "Il distingue le contenu du cours de ses connaissances générales et vous signale quand une information n'est pas dans vos ressources." },
    { i: Target, t: "Exercices, quiz et remédiation", d: "Il vous interroge, corrige vos réponses et crée des exercices ciblés sur vos points faibles." },
    { i: Route, t: "Parcours personnalisé", d: "À partir de vos résultats, il identifie vos lacunes et recommande les leçons à revoir." },
    { i: Mic, t: "À l'oral", d: status.voiceServer ? "Parlez-lui et écoutez ses réponses : reconnaissance et synthèse vocales en français." : "Conversation orale avec les fonctions vocales de votre navigateur lorsqu'elles sont disponibles." },
    { i: ImageIcon, t: "Images et documents", d: "Envoyez une photo d'exercice, une capture ou un PDF : il l'analyse et vous l'explique." },
    { i: Lock, t: "Respect de vos accès", d: "Il n'utilise que les contenus des formations auxquelles vous avez accès." },
  ];
  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6">
          <Sparkles className="mx-auto h-12 w-12 text-accent" aria-hidden />
          <h1 className="mt-4 text-4xl font-extrabold">{brand.tutorName}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-200">
            Bien plus qu'un chatbot : un formateur personnel patient et rigoureux, intégré à chaque cours et disponible 24h/24.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/espace/tuteur" className={buttonClass("accent", "lg")}>Parler à mon tuteur IA</Link>
            <Link href="/formations" className={buttonClass("outline", "lg", "border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white")}>Voir les formations</Link>
          </div>
          {!status.chat && <p className="mt-6 text-sm text-amber-200">Le tuteur est en cours d'activation sur la plateforme.</p>}
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ i: I, t, d }) => (
            <div key={t} className="rounded-2xl border border-line p-6">
              <I className="h-7 w-7 text-sky" aria-hidden />
              <h2 className="mt-3 font-semibold text-navy">{t}</h2>
              <p className="mt-1 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 grid gap-6 rounded-3xl bg-sky-50 p-8 md:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-navy"><FileSearch className="h-5 w-5 text-sky" aria-hidden /> Comment ça fonctionne ?</h2>
            <p className="mt-3 text-sm text-ink">
              Quand vous posez une question, {brand.tutorName} recherche les passages les plus pertinents dans les supports de vos formations (recherche sémantique
              et plein texte), puis rédige une réponse fondée sur ces passages en citant ses sources [S1], [S2]… Il tient compte de votre niveau, de votre
              progression et des notions à retravailler identifiées dans vos quiz et devoirs.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-bold text-navy">Ce qu'il faut savoir</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink">
              <li>Une connexion Internet est nécessaire pour échanger avec le tuteur.</li>
              <li>Comme toute IA, il peut se tromper : vérifiez les points importants dans vos supports ou auprès de votre formateur.</li>
              <li>Il vous guide sur les devoirs notés sans les faire à votre place.</li>
              <li>Les certificats sont délivrés selon les critères des formateurs, jamais par l'IA seule.</li>
              <li>Vos conversations sont privées ; vous pouvez les supprimer à tout moment.</li>
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}
