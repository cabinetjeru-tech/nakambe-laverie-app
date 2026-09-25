import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Award, BarChart3, BookOpen, CheckCircle2, Clock, FileText, Globe2, Heart, Lock, MonitorPlay, PlayCircle, ClipboardCheck,
  PenSquare, Radio, Sparkles, Users,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { courseAccess, hasActiveSubscription } from "@/lib/access";
import { withRatings } from "@/lib/catalog";
import { formatDate, formatDateTime, formatDuration, formatXof, initials, levelLabels } from "@/lib/format";
import { getBrand } from "@/lib/settings";
import { publicFileUrl } from "@/lib/storage";
import { enrollAction, submitReviewAction, toggleFavoriteAction } from "@/app/actions/learning";
import { CourseCover } from "@/components/course/course-card";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Badge, Card, CardBody, Field, Select, Stars, Textarea, buttonClass } from "@/components/ui";
import { TutorContext } from "@/components/tutor/tutor-context";

export const dynamic = "force-dynamic";

const lessonIcons = { VIDEO: PlayCircle, TEXT: FileText, DOCUMENT: FileText, QUIZ: ClipboardCheck, ASSIGNMENT: PenSquare, LIVE: Radio };

async function load(slug: string) {
  return prisma.course.findUnique({
    where: { slug },
    include: {
      category: true,
      trainer: { select: { id: true, name: true, headline: true, bio: true, avatarFileId: true, expertise: true } },
      modules: { orderBy: { position: "asc" }, include: { lessons: { orderBy: { position: "asc" }, select: { id: true, title: true, type: true, durationMinutes: true, isPreview: true } } } },
      quizzes: { where: { isFinalExam: true }, select: { id: true, passingScore: true } },
      assignments: { where: { isProject: true }, select: { id: true } },
      reviews: { where: { status: "APPROVED" }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { name: true } } } },
      liveSessions: { where: { startsAt: { gte: new Date() }, status: "SCHEDULED" }, orderBy: { startsAt: "asc" }, take: 3 },
      _count: { select: { enrollments: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const c = await prisma.course.findUnique({ where: { slug }, select: { title: true, subtitle: true, status: true } });
  if (!c || c.status !== "PUBLISHED") return { title: "Formation introuvable" };
  return { title: c.title, description: c.subtitle ?? undefined };
}

export default async function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [course, user, brand] = await Promise.all([load(slug), getCurrentUser(), getBrand()]);
  if (!course) notFound();
  const access = user ? await courseAccess(user, course.id) : "none";
  // Une formation non publiée n'est visible que par son formateur et l'administration (aperçu).
  if (course.status !== "PUBLISHED" && access !== "staff" && access !== "trainer") notFound();

  const [rated] = await withRatings([course]);
  const lessonsTotal = course.modules.reduce((s, m) => s + m.lessons.length, 0);
  const enrollment = user ? await prisma.enrollment.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } }) : null;
  const favorite = user ? await prisma.favorite.findUnique({ where: { userId_courseId: { userId: user.id, courseId: course.id } } }) : null;
  const subActive = user ? await hasActiveSubscription(user.id) : false;
  const free = course.isFree || course.priceXof === 0;
  const hasAccess = access !== "none";
  const packs = await prisma.pack.findMany({ where: { active: true, courses: { some: { courseId: course.id } } }, select: { slug: true, title: true, priceXof: true } });

  return (
    <>
      <section className="bg-navy text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_380px] lg:py-14">
          <div>
            <nav className="text-xs text-sky-200" aria-label="Fil d'Ariane">
              <Link href="/formations" className="hover:underline">Formations</Link>
              {course.category && (
                <>
                  {" / "}
                  <Link href={`/formations?categorie=${course.category.slug}`} className="hover:underline">{course.category.name}</Link>
                </>
              )}
            </nav>
            {course.status !== "PUBLISHED" && <Badge tone="amber" className="mt-3">Aperçu — formation non publiée ({course.status})</Badge>}
            <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-4xl">{course.title}</h1>
            {course.subtitle && <p className="mt-3 text-lg text-slate-200">{course.subtitle}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-200">
              {rated?.rating ? (
                <span className="inline-flex items-center gap-1.5"><b className="text-accent">{rated.rating.avg.toFixed(1)}</b><Stars value={rated.rating.avg} /> ({rated.rating.count} avis)</span>
              ) : (
                <span>Pas encore d'avis</span>
              )}
              <span className="inline-flex items-center gap-1"><Users className="h-4 w-4" aria-hidden /> {course._count.enrollments} apprenant{course._count.enrollments > 1 ? "s" : ""}</span>
              <span>Formateur : <Link href={`/formateurs/${course.trainer.id}`} className="font-semibold text-white underline-offset-2 hover:underline">{course.trainer.name}</Link></span>
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1"><BarChart3 className="h-3.5 w-3.5" aria-hidden />{levelLabels[course.level]}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1"><Clock className="h-3.5 w-3.5" aria-hidden />{formatDuration(course.durationMinutes)}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1"><BookOpen className="h-3.5 w-3.5" aria-hidden />{lessonsTotal} leçons</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1"><Globe2 className="h-3.5 w-3.5" aria-hidden />Français</span>
              {course.hasCertificate && <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-3 py-1 text-accent"><Award className="h-3.5 w-3.5" aria-hidden />Certificat</span>}
            </div>
          </div>

          {/* Carte d'achat */}
          <Card className="self-start overflow-hidden text-ink lg:sticky lg:top-20">
            <CourseCover title={course.title} image={rated?.image ?? null} />
            <CardBody className="space-y-3">
              {hasAccess ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" aria-hidden /> Vous avez accès à cette formation</div>
                  {enrollment && enrollment.progressPercent > 0 && <div className="text-xs text-muted">Progression : {enrollment.progressPercent} %</div>}
                  {enrollment || access === "staff" || access === "trainer" ? (
                    <Link href={`/espace/apprendre/${course.slug}`} className={buttonClass("primary", "lg", "w-full")}>
                      {enrollment?.progressPercent ? "Continuer la formation" : "Commencer la formation"}
                    </Link>
                  ) : (
                    <form action={enrollAction.bind(null, course.id)}>
                      <SubmitButton size="lg" className="w-full">Ajouter à mes formations</SubmitButton>
                    </form>
                  )}
                </>
              ) : (
                <>
                  <div className="text-3xl font-extrabold text-navy">{free ? "Gratuit" : formatXof(course.priceXof)}</div>
                  {free ? (
                    user ? (
                      <form action={enrollAction.bind(null, course.id)}>
                        <SubmitButton variant="accent" size="lg" className="w-full">Commencer gratuitement</SubmitButton>
                      </form>
                    ) : (
                      <Link href={`/inscription?suivant=/formations/${course.slug}`} className={buttonClass("accent", "lg", "w-full")}>S'inscrire et commencer gratuitement</Link>
                    )
                  ) : (
                    <>
                      <Link
                        href={user ? `/paiement/commande?type=COURSE&id=${course.id}` : `/connexion?suivant=${encodeURIComponent(`/paiement/commande?type=COURSE&id=${course.id}`)}`}
                        className={buttonClass("accent", "lg", "w-full")}
                      >
                        Acheter cette formation
                      </Link>
                      {course.includedInSubscription && (
                        subActive ? (
                          <form action={enrollAction.bind(null, course.id)}>
                            <SubmitButton variant="outline" className="w-full">Accéder avec mon abonnement</SubmitButton>
                          </form>
                        ) : (
                          <Link href="/tarifs" className={buttonClass("outline", "md", "w-full")}>Incluse dans l'abonnement — voir les tarifs</Link>
                        )
                      )}
                    </>
                  )}
                  {!user && <p className="text-center text-xs text-muted">Déjà inscrit ? <Link href={`/connexion?suivant=/formations/${course.slug}`} className="font-medium text-sky">Connexion</Link></p>}
                </>
              )}
              {user && (
                <form action={toggleFavoriteAction.bind(null, course.id)}>
                  <SubmitButton variant="ghost" size="sm" className="w-full">
                    <Heart className={`h-4 w-4 ${favorite ? "fill-red-500 text-red-500" : ""}`} aria-hidden /> {favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                  </SubmitButton>
                </form>
              )}
              <ul className="space-y-1.5 border-t border-line pt-3 text-sm text-muted">
                <li className="flex gap-2"><MonitorPlay className="h-4 w-4 shrink-0 text-sky" aria-hidden />{course.modality}</li>
                <li className="flex gap-2"><Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />Tuteur IA {brand.tutorName} inclus</li>
                {course.hasCertificate && <li className="flex gap-2"><Award className="h-4 w-4 shrink-0 text-sky" aria-hidden />Certificat vérifiable par QR code</li>}
              </ul>
              {packs.length > 0 && !hasAccess && (
                <div className="rounded-lg bg-accent-50 p-3 text-xs text-navy">
                  Aussi disponible dans : {packs.map((p) => <Link key={p.slug} href={`/paiement/commande?type=PACK&slug=${p.slug}`} className="font-semibold underline">{p.title} ({formatXof(p.priceXof)})</Link>)}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-10">
          {course.objectives.length > 0 && (
            <section className="rounded-2xl border border-line p-6">
              <h2 className="text-xl font-bold text-navy">Objectifs pédagogiques</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {course.objectives.map((o) => (
                  <li key={o} className="flex gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />{o}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="text-xl font-bold text-navy">Description</h2>
            <p className="mt-3 whitespace-pre-line leading-7 text-ink">{course.description}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-navy">Programme détaillé</h2>
            <p className="mt-1 text-sm text-muted">{course.modules.length} modules · {lessonsTotal} leçons · {formatDuration(course.durationMinutes)}</p>
            <div className="mt-4 space-y-3">
              {course.modules.map((m, i) => (
                <details key={m.id} open={i === 0} className="group rounded-2xl border border-line bg-white">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide text-sky">Module {i + 1}</div>
                      <div className="font-semibold text-navy">{m.title}</div>
                    </div>
                    <span className="text-xs text-muted">{m.lessons.length} leçon{m.lessons.length > 1 ? "s" : ""}</span>
                  </summary>
                  <ul className="border-t border-line">
                    {m.lessons.map((l) => {
                      const Icon = lessonIcons[l.type];
                      const open = hasAccess || l.isPreview;
                      return (
                        <li key={l.id} className="flex items-center gap-3 border-b border-line px-5 py-3 text-sm last:border-0">
                          <Icon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                          {open ? (
                            <Link href={`/espace/apprendre/${course.slug}/${l.id}`} className="flex-1 text-ink hover:text-sky">{l.title}</Link>
                          ) : (
                            <span className="flex-1 text-ink">{l.title}</span>
                          )}
                          {l.isPreview && !hasAccess && <Badge tone="green">Aperçu gratuit</Badge>}
                          {!open && <Lock className="h-3.5 w-3.5 text-muted" aria-label="Réservé aux inscrits" />}
                          <span className="w-14 text-right text-xs text-muted">{l.durationMinutes ? `${l.durationMinutes} min` : ""}</span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
            </div>
          </section>

          <section className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border border-line p-6">
              <h2 className="text-lg font-bold text-navy">Prérequis</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{course.prerequisites.length ? course.prerequisites.map((p) => <li key={p}>{p}</li>) : <li>Aucun prérequis particulier.</li>}</ul>
            </div>
            <div className="rounded-2xl border border-line p-6">
              <h2 className="text-lg font-bold text-navy">Pour qui ?</h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{course.targetAudience.length ? course.targetAudience.map((p) => <li key={p}>{p}</li>) : <li>Tout public motivé.</li>}</ul>
            </div>
          </section>

          {course.hasCertificate && (
            <section className="rounded-2xl border border-accent/40 bg-accent-50 p-6">
              <h2 className="flex items-center gap-2 text-lg font-bold text-navy"><Award className="h-5 w-5 text-accent" aria-hidden /> Certificat de réussite</h2>
              <p className="mt-2 text-sm">Délivré automatiquement lorsque vous remplissez les critères fixés par le formateur :</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                <li>Progression minimale : {course.certMinProgress} % des leçons</li>
                {course.quizzes.length > 0 && <li>Réussite à l'examen final (au moins {Math.max(course.certMinExamScore, ...course.quizzes.map((q) => q.passingScore))} %)</li>}
                {course.certRequireProjects && course.assignments.length > 0 && <li>Validation du/des projet(s) pratique(s) par le formateur</li>}
                {course.certMinAttendance > 0 && <li>Présence à au moins {course.certMinAttendance} % des classes virtuelles</li>}
                {course.certRequireHumanApproval && <li>Validation finale par l'équipe pédagogique</li>}
              </ul>
              <p className="mt-3 text-xs text-muted">Certificat numérique avec identifiant unique et QR code de vérification. Il atteste d'une formation professionnelle suivie et ne constitue pas un diplôme d'État.</p>
            </section>
          )}

          {course.liveSessions.length > 0 && (
            <section>
              <h2 className="text-xl font-bold text-navy">Prochaines classes virtuelles</h2>
              <ul className="mt-3 space-y-2">
                {course.liveSessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line p-4 text-sm">
                    <Radio className="h-5 w-5 text-red-500" aria-hidden />
                    <div className="flex-1"><div className="font-medium text-navy">{s.title}</div><div className="text-muted">{formatDateTime(s.startsAt)} · {s.durationMinutes} min</div></div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section id="avis">
            <h2 className="text-xl font-bold text-navy">Avis des apprenants</h2>
            {course.reviews.length === 0 ? (
              <p className="mt-2 text-sm text-muted">Aucun avis publié pour le moment.</p>
            ) : (
              <ul className="mt-4 space-y-4">
                {course.reviews.map((r) => (
                  <li key={r.id} className="rounded-2xl border border-line p-5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-xs font-bold text-navy">{initials(r.user.name)}</span>
                        <div>
                          <div className="text-sm font-semibold text-navy">{r.user.name}</div>
                          {r.verified && <div className="text-[11px] text-emerald-700">Apprenant vérifié</div>}
                        </div>
                      </div>
                      <div className="text-right"><Stars value={r.rating} /><div className="text-[11px] text-muted">{formatDate(r.createdAt)}</div></div>
                    </div>
                    <p className="mt-3 text-sm">{r.comment}</p>
                  </li>
                ))}
              </ul>
            )}
            {enrollment && (
              <Card className="mt-6">
                <CardBody>
                  <h3 className="font-semibold text-navy">Donner mon avis</h3>
                  <ActionForm action={submitReviewAction} className="mt-3 space-y-3" resetOnSuccess>
                    <input type="hidden" name="courseId" value={course.id} />
                    <Field label="Note">
                      <Select name="rating" defaultValue="5" className="max-w-40">
                        {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
                      </Select>
                    </Field>
                    <Field label="Votre avis"><Textarea name="comment" required minLength={10} maxLength={1500} placeholder="Qu'avez-vous appris ? Que pourrait-on améliorer ?" /></Field>
                    <SubmitButton>Publier mon avis</SubmitButton>
                  </ActionForm>
                </CardBody>
              </Card>
            )}
          </section>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardBody>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Votre formateur</h2>
              <div className="mt-3 flex items-center gap-3">
                {course.trainer.avatarFileId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={publicFileUrl(course.trainer.avatarFileId)!} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span className="grid h-14 w-14 place-items-center rounded-full bg-navy font-bold text-white">{initials(course.trainer.name)}</span>
                )}
                <div>
                  <Link href={`/formateurs/${course.trainer.id}`} className="font-semibold text-navy hover:text-sky">{course.trainer.name}</Link>
                  {course.trainer.headline && <div className="text-xs text-muted">{course.trainer.headline}</div>}
                </div>
              </div>
              {course.trainer.bio && <p className="mt-3 line-clamp-5 text-sm text-muted">{course.trainer.bio}</p>}
            </CardBody>
          </Card>
          <Card className="bg-sky-50">
            <CardBody>
              <div className="flex items-center gap-2 font-semibold text-navy"><Sparkles className="h-4 w-4 text-accent" aria-hidden /> Une question sur cette formation ?</div>
              <p className="mt-1 text-sm text-muted">Utilisez le bouton « {brand.tutorName} » en bas de l'écran : il connaît le programme et vous aide à choisir.</p>
            </CardBody>
          </Card>
        </aside>
      </div>
      <TutorContext courseId={course.id} />
    </>
  );
}
