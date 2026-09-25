import Link from "next/link";
import {
  ArrowRight, Award, BookOpenCheck, Briefcase, Camera, CheckCircle2, GraduationCap, Laptop, Megaphone, MessageSquareText,
  Mic, ShieldCheck, Smartphone, Sparkles, Target, Video, WifiOff, Wrench,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getBrand } from "@/lib/settings";
import { courseCardSelect, withRatings } from "@/lib/catalog";
import { CourseCard } from "@/components/course/course-card";
import { buttonClass, Stars } from "@/components/ui";

const icons: Record<string, React.ComponentType<{ className?: string }>> = { Laptop, Briefcase, Megaphone, Camera, Wrench, Target };

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const brand = await getBrand();
  const [featured, cats, stats, reviews] = await Promise.all([
    prisma.course.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ featured: "desc" }, { publishedAt: "desc" }], take: 6, select: courseCardSelect }),
    prisma.category.findMany({ orderBy: { position: "asc" }, include: { _count: { select: { courses: { where: { status: "PUBLISHED" } } } } } }),
    Promise.all([
      prisma.course.count({ where: { status: "PUBLISHED" } }),
      prisma.user.count({ where: { role: "TRAINER", status: "ACTIVE", coursesTaught: { some: { status: "PUBLISHED" } } } }),
      prisma.lesson.count({ where: { module: { course: { status: "PUBLISHED" } } } }),
    ]),
    prisma.review.findMany({
      where: { status: "APPROVED", featured: true, verified: true },
      take: 3,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } }, course: { select: { title: true } } },
    }),
  ]);
  const courses = await withRatings(featured);
  const [courseCount, trainerCount, lessonTotal] = stats;
  const [sloganA, ...sloganRest] = brand.slogan.split(",");

  return (
    <>
      {/* Héros */}
      <section className="relative overflow-hidden bg-navy text-white">
        <div className="hero-grid decorative absolute inset-0" aria-hidden />
        <div className="decorative absolute -right-32 -top-32 h-96 w-96 rounded-full bg-sky/30 blur-3xl" aria-hidden />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div className="fade-in">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-sky-100 ring-1 ring-white/15">
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden /> Avec {brand.tutorName}, votre tuteur IA 24h/24
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
              {sloganA}
              {sloganRest.length > 0 && (
                <>
                  ,<br />
                  <span className="text-accent">{sloganRest.join(",").trim()}</span>
                </>
              )}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-200">
              Des formations professionnelles pratiques en numérique, entrepreneuriat, communication et métiers techniques — pensées pour le Burkina
              Faso et l'Afrique francophone, accessibles sur votre téléphone, même avec une connexion limitée.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/inscription" className={buttonClass("accent", "lg")}>
                Commencer gratuitement <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link href="/formations" className={buttonClass("outline", "lg", "border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white")}>
                Voir les formations
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
              <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-sky-200" aria-hidden /> Application installable Android</span>
              <span className="inline-flex items-center gap-1.5"><WifiOff className="h-4 w-4 text-sky-200" aria-hidden /> Mode faible débit</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-sky-200" aria-hidden /> Paiement Mobile Money sécurisé</span>
            </div>
          </div>

          <div className="fade-in relative hidden lg:block" aria-hidden>
            <div className="rounded-3xl bg-white p-5 text-ink shadow-2xl ring-1 ring-black/5">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-navy"><Sparkles className="h-4 w-4 text-accent" /></div>
                <div>
                  <div className="text-sm font-semibold text-navy">{brand.tutorName}</div>
                  <div className="text-[11px] text-muted">Illustration d'un échange</div>
                </div>
              </div>
              <div className="space-y-3 py-4 text-sm">
                <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-navy px-3 py-2 text-white">Je ne comprends pas le seuil de rentabilité 😕</div>
                <div className="w-fit max-w-[92%] rounded-2xl rounded-bl-md border border-line px-3 py-2">
                  Pas de souci ! Imagine ta boutique de savons au karité : chaque savon te rapporte <b>375 FCFA</b> de marge. Si tes charges font{" "}
                  <b>45 000 FCFA</b> par mois, combien de savons dois-tu vendre pour les couvrir ?
                  <div className="mt-1 text-[11px] text-muted">D'après ton cours : « Calculer son coût de revient » <sup className="rounded bg-sky-100 px-1 font-bold text-navy">S1</sup></div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Plus simple", "Exemple concret", "Interroge-moi", "Mes lacunes"].map((c) => (
                  <span key={c} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-navy">{c}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Chiffres réels, calculés depuis la base */}
      <section className="border-b border-line bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-8 sm:px-6 md:grid-cols-4">
          {[
            { v: courseCount, l: `formation${courseCount > 1 ? "s" : ""} disponible${courseCount > 1 ? "s" : ""}` },
            { v: lessonTotal, l: "leçons en ligne" },
            { v: trainerCount, l: `formateur${trainerCount > 1 ? "s" : ""} actif${trainerCount > 1 ? "s" : ""}` },
            { v: "24h/24", l: "tuteur IA disponible" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div className="text-3xl font-extrabold text-navy">{s.v}</div>
              <div className="text-sm text-muted">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Catégories */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-bold text-navy sm:text-3xl">Explorez nos domaines</h2>
        <p className="mt-1 text-muted">Des compétences concrètes, directement utiles pour votre emploi ou votre entreprise.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cats.map((c) => {
            const Icon = icons[c.icon ?? ""] ?? GraduationCap;
            return (
              <Link key={c.id} href={`/formations?categorie=${c.slug}`} className="group flex items-start gap-4 rounded-2xl border border-line bg-white p-5 transition hover:border-sky-200 hover:shadow-soft">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky group-hover:bg-navy group-hover:text-white">
                  <Icon className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-semibold text-navy">{c.name}</div>
                  <div className="mt-0.5 text-sm text-muted">{c.description}</div>
                  <div className="mt-2 text-xs font-medium text-sky">{c._count.courses} formation{c._count.courses > 1 ? "s" : ""}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {courses.length > 0 && (
        <section className="bg-surface py-14">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-navy sm:text-3xl">Formations à la une</h2>
                <p className="mt-1 text-muted">Commencez aujourd'hui, à votre rythme.</p>
              </div>
              <Link href="/formations" className="hidden text-sm font-semibold text-sky hover:underline sm:inline">Tout le catalogue →</Link>
            </div>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => <CourseCard key={c.id} course={c} />)}
            </div>
          </div>
        </section>
      )}

      {/* Tuteur IA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-sky">Au cœur de l'expérience</span>
            <h2 className="mt-2 text-3xl font-bold text-navy">{brand.tutorName}, un formateur personnel disponible jour et nuit</h2>
            <p className="mt-4 text-muted">
              {brand.tutorName} s'appuie sur le contenu de vos formations. Il explique autrement quand vous bloquez, adapte son niveau au vôtre, crée
              des exercices, vous interroge et repère vos lacunes à partir de vos résultats. Chaque réponse fondée sur le cours cite ses sources.
            </p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                { i: MessageSquareText, t: "Explications pas à pas, adaptées à votre niveau" },
                { i: BookOpenCheck, t: "Réponses fondées sur vos supports, avec références" },
                { i: Target, t: "Exercices, quiz et remédiation personnalisés" },
                { i: Mic, t: "Conversation à l'oral et analyse d'images" },
              ].map(({ i: I, t }) => (
                <li key={t} className="flex gap-3 rounded-xl bg-sky-50 p-3 text-sm text-navy">
                  <I className="h-5 w-5 shrink-0 text-sky" aria-hidden /> {t}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/tuteur-ia" className={buttonClass("primary", "lg")}>Découvrir {brand.tutorName}</Link>
              <Link href="/espace/tuteur" className={buttonClass("outline", "lg")}><Sparkles className="h-4 w-4 text-accent" aria-hidden /> Parler à mon tuteur IA</Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { i: Video, t: "Cours vidéo et textes", d: "Vitesse réglable, sous-titres, reprise automatique là où vous vous êtes arrêté." },
              { i: GraduationCap, t: "Classes virtuelles", d: "Séances en direct avec vos formateurs, rappels et replays." },
              { i: Award, t: "Certificats vérifiables", d: "Identifiant unique et QR code, délivrés selon des critères clairs." },
              { i: WifiOff, t: "Pensé pour la connectivité africaine", d: "Mode faible débit, supports hors ligne, progression sauvegardée en cas de coupure." },
            ].map(({ i: I, t, d }) => (
              <div key={t} className="rounded-2xl border border-line p-5">
                <I className="h-6 w-6 text-sky" aria-hidden />
                <div className="mt-3 font-semibold text-navy">{t}</div>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-navy py-14 text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Comment ça marche ?</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              { n: "1", t: "Créez votre compte gratuit", d: "En une minute, puis commencez les formations gratuites et les leçons d'aperçu." },
              { n: "2", t: "Choisissez votre formule", d: "Achat à l'unité, pack ou abonnement, payable par Mobile Money ou carte." },
              { n: "3", t: "Apprenez et certifiez-vous", d: "Leçons, exercices, tuteur IA, classes en direct, puis certificat vérifiable." },
            ].map((s) => (
              <div key={s.n} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                <div className="grid h-10 w-10 place-items-center rounded-full bg-accent font-bold text-navy">{s.n}</div>
                <div className="mt-4 text-lg font-semibold">{s.t}</div>
                <p className="mt-1 text-sm text-slate-300">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Avis vérifiés : section affichée seulement s'il existe de vrais avis mis en avant */}
      {reviews.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-bold text-navy sm:text-3xl">Ils se sont formés avec nous</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {reviews.map((r) => (
              <figure key={r.id} className="rounded-2xl border border-line p-6">
                <Stars value={r.rating} />
                <blockquote className="mt-3 text-sm text-ink">« {r.comment} »</blockquote>
                <figcaption className="mt-4 text-sm">
                  <span className="font-semibold text-navy">{r.user.name}</span>
                  <span className="block text-xs text-muted">Apprenant vérifié · {r.course.title}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-gradient-to-br from-sky-50 to-white p-8 ring-1 ring-line md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold text-navy">Prêt à développer vos compétences ?</h2>
            <p className="mt-1 text-muted">Inscription gratuite, sans engagement. Commencez par une formation gratuite dès aujourd'hui.</p>
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-navy">
              {["Accès immédiat", "Paiement Mobile Money", "Tuteur IA inclus"].map((t) => (
                <li key={t} className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />{t}</li>
              ))}
            </ul>
          </div>
          <Link href="/inscription" className={buttonClass("accent", "lg")}>S'inscrire gratuitement</Link>
        </div>
      </section>
    </>
  );
}
