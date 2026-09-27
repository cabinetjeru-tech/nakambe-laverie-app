import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Award, BookOpen, Clock, UserPlus, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { formatDate } from "@/lib/format";
import { addLearnersAction } from "@/app/actions/learners";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  Badge,
  Card,
  CardBody,
  Field,
  PageHeader,
  ProgressBar,
  Select,
  Stat,
  Table,
  Td,
  Textarea,
  Th,
  buttonClass,
  inputClass,
} from "@/components/ui";

export const metadata = { title: "Apprenants" };

const DAY = 24 * 3600_000;

const suiviOptions: Record<string, string> = {
  "sans-formation": "Sans formation",
  "jamais-commence": "Inscrits, jamais commencé",
  "en-cours": "Formation en cours",
  termine: "Formation terminée",
  "certif-attente": "Certificat en attente de validation",
  certifie: "Certifiés",
  inactif: "Inactifs depuis 14 jours",
};

type Search = {
  q?: string;
  statut?: string;
  periode?: string;
  formation?: string;
  suivi?: string;
  page?: string;
};

function buildWhere(sp: Search): Prisma.UserWhereInput {
  const and: Prisma.UserWhereInput[] = [
    { role: "LEARNER" },
    {
      status:
        sp.statut === "suspendu"
          ? "SUSPENDED"
          : sp.statut === "actif"
            ? "ACTIVE"
            : { not: "DELETED" },
    },
  ];
  if (sp.q)
    and.push({
      OR: [
        { name: { contains: sp.q, mode: "insensitive" } },
        { email: { contains: sp.q, mode: "insensitive" } },
        { phone: { contains: sp.q } },
        { city: { contains: sp.q, mode: "insensitive" } },
      ],
    });
  if (sp.periode === "7" || sp.periode === "30")
    and.push({
      createdAt: { gte: new Date(Date.now() - Number(sp.periode) * DAY) },
    });
  if (sp.formation)
    and.push({
      enrollments: { some: { courseId: sp.formation, status: "ACTIVE" } },
    });
  const active = { status: "ACTIVE" as const };
  switch (sp.suivi) {
    case "sans-formation":
      and.push({ enrollments: { none: active } });
      break;
    case "jamais-commence":
      and.push({
        enrollments: {
          some: active,
          none: { ...active, progressPercent: { gt: 0 } },
        },
      });
      break;
    case "en-cours":
      and.push({
        enrollments: {
          some: { ...active, progressPercent: { gt: 0, lt: 100 } },
        },
      });
      break;
    case "termine":
      and.push({
        enrollments: { some: { ...active, completedAt: { not: null } } },
      });
      break;
    case "certif-attente":
      and.push({ certificates: { some: { status: "PENDING_APPROVAL" } } });
      break;
    case "certifie":
      and.push({ certificates: { some: { status: "VALID" } } });
      break;
    case "inactif":
      and.push({
        OR: [
          { lastLoginAt: null },
          { lastLoginAt: { lt: new Date(Date.now() - 14 * DAY) } },
        ],
      });
      break;
  }
  return { AND: and };
}

function lastActivity(u: {
  lastLoginAt: Date | null;
  enrollments: { lastAccessedAt: Date | null }[];
}) {
  const dates = [
    u.lastLoginAt,
    ...u.enrollments.map((e) => e.lastAccessedAt),
  ].filter((d): d is Date => Boolean(d));
  return dates.length
    ? new Date(Math.max(...dates.map((d) => d.getTime())))
    : null;
}

export default async function LearnersPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const sp = await searchParams;
  const admin = await requirePermission("users.view");
  const manage = can(admin.role, "users.manage");
  const page = Math.max(1, Number(sp.page) || 1);
  const where = buildWhere(sp);
  const learner = {
    role: "LEARNER" as const,
    status: { not: "DELETED" as const },
  };
  const enrolledLearner = { status: "ACTIVE" as const, user: learner };
  const now = Date.now();

  const [learners, total, courses, stats] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 30,
      take: 30,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        city: true,
        country: true,
        status: true,
        isDemo: true,
        createdAt: true,
        lastLoginAt: true,
        enrollments: {
          where: { status: "ACTIVE" },
          select: {
            progressPercent: true,
            completedAt: true,
            lastAccessedAt: true,
          },
        },
        certificates: { select: { status: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.course.findMany({
      where: { status: { in: ["PUBLISHED", "ARCHIVED"] } },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
    Promise.all([
      prisma.user.count({ where: learner }),
      prisma.user.count({
        where: { ...learner, createdAt: { gte: new Date(now - 7 * DAY) } },
      }),
      prisma.user.count({
        where: { ...learner, createdAt: { gte: new Date(now - 30 * DAY) } },
      }),
      prisma.user.count({
        where: { ...learner, lastLoginAt: { gte: new Date(now - 7 * DAY) } },
      }),
      prisma.user.count({ where: { role: "LEARNER", status: "SUSPENDED" } }),
      prisma.enrollment.count({ where: enrolledLearner }),
      prisma.enrollment.count({
        where: { ...enrolledLearner, progressPercent: { gt: 0 } },
      }),
      prisma.enrollment.count({
        where: { ...enrolledLearner, completedAt: { not: null } },
      }),
      prisma.certificate.count({
        where: { status: "PENDING_APPROVAL", user: learner },
      }),
      prisma.certificate.count({ where: { status: "VALID", user: learner } }),
    ]),
  ]);
  const [
    all,
    new7,
    new30,
    active7,
    suspended,
    enrolled,
    started,
    completed,
    certPending,
    certValid,
  ] = stats;
  const funnel = [
    {
      label: "Inscriptions à une formation",
      value: enrolled,
      href: "?suivi=jamais-commence",
      hint: `${enrolled - started} jamais commencée(s)`,
    },
    { label: "Formations commencées", value: started, href: "?suivi=en-cours" },
    { label: "Formations terminées", value: completed, href: "?suivi=termine" },
    {
      label: "Certificats délivrés",
      value: certValid,
      href: "?suivi=certifie",
      hint: certPending ? `${certPending} en attente de validation` : undefined,
    },
  ];
  const qs = (extra: Record<string, string>) =>
    `?${new URLSearchParams({ ...(sp as Record<string, string>), ...extra })}`;
  const filtered = Boolean(
    sp.q || sp.statut || sp.periode || sp.formation || sp.suivi,
  );

  return (
    <>
      <PageHeader
        title="Apprenants"
        subtitle="Suivi complet : inscriptions, progression, résultats, certificats et activité."
        actions={
          <a
            href="/api/admin/export/apprenants-liste"
            className={buttonClass("outline")}
          >
            Exporter (CSV)
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Apprenants"
          value={all}
          hint={suspended ? `${suspended} suspendu(s)` : "aucun suspendu"}
          icon={<Users className="h-5 w-5" />}
        />
        <Stat
          label="Nouveaux (7 jours)"
          value={new7}
          hint={`${new30} sur 30 jours`}
          icon={<UserPlus className="h-5 w-5" />}
        />
        <Stat
          label="Actifs (7 jours)"
          value={active7}
          hint={
            all
              ? `${Math.round((active7 / all) * 100)} % des apprenants`
              : undefined
          }
          icon={<Clock className="h-5 w-5" />}
        />
        <Stat
          label="Certificats à valider"
          value={certPending}
          hint={
            <Link
              href="?suivi=certif-attente"
              className="text-sky hover:underline"
            >
              Voir les apprenants
            </Link>
          }
          icon={<Award className="h-5 w-5" />}
        />
      </div>

      <Card className="mt-6">
        <CardBody>
          <h2 className="flex items-center gap-2 font-semibold text-navy">
            <BookOpen className="h-5 w-5 text-sky" aria-hidden /> Parcours
            jusqu'au certificat
          </h2>
          <p className="mt-1 text-sm text-muted">
            Toutes formations confondues. Cliquez sur une étape pour voir les
            apprenants concernés.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {funnel.map((f, i) => (
              <Link
                key={f.label}
                href={f.href}
                className="rounded-xl border border-line p-4 hover:border-sky-200"
              >
                <div className="text-xs font-medium uppercase tracking-wide text-muted">
                  Étape {i + 1}
                </div>
                <div className="mt-1 text-2xl font-bold text-navy">
                  {f.value}
                </div>
                <div className="text-sm text-ink">{f.label}</div>
                {i > 0 && (
                  <ProgressBar
                    value={
                      enrolled ? Math.round((f.value / enrolled) * 100) : 0
                    }
                    className="mt-2"
                  />
                )}
                <div className="mt-1 text-xs text-muted">
                  {i > 0 && enrolled
                    ? `${Math.round((f.value / enrolled) * 100)} % des inscriptions`
                    : ""}
                  {f.hint ? `${i > 0 && enrolled ? " · " : ""}${f.hint}` : ""}
                </div>
              </Link>
            ))}
          </div>
        </CardBody>
      </Card>

      {manage && (
        <details
          className="group mt-6 rounded-2xl border border-line bg-white shadow-soft"
          open={total === 0 && !filtered}
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 p-5 font-semibold text-navy">
            <UserPlus className="h-5 w-5 text-sky" aria-hidden /> Ajouter des
            apprenants
            <span className="text-sm font-normal text-muted">
              — un ou plusieurs à la fois, avec inscription directe à une
              formation
            </span>
            <span className="ml-auto text-sm text-sky group-open:hidden">
              Ouvrir
            </span>
          </summary>
          <div className="border-t border-line p-5">
            <p className="text-sm text-muted">
              Une personne par ligne : <b>Nom, email, téléphone</b> (téléphone
              facultatif). Chacun reçoit un lien pour choisir son mot de passe.
            </p>
            <ActionForm
              action={addLearnersAction}
              className="mt-3"
              resetOnSuccess
            >
              <div className="grid gap-3 lg:grid-cols-[1fr_320px]">
                <Field label="Personnes">
                  <Textarea
                    name="people"
                    rows={5}
                    required
                    placeholder={
                      "Awa Ouédraogo, awa@exemple.com, +226 70 00 00 00\nMoussa Traoré, moussa@exemple.com"
                    }
                  />
                </Field>
                <div className="space-y-3">
                  <Field label="Inscrire à une formation (facultatif)">
                    <Select name="courseId" defaultValue="">
                      <option value="">— Aucune —</option>
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <SubmitButton className="w-full">Ajouter</SubmitButton>
                </div>
              </div>
            </ActionForm>
          </div>
        </details>
      )}

      <div className="mt-6">
        <div className="min-w-0 space-y-4">
          <form className="flex flex-wrap gap-2">
            <input
              name="q"
              defaultValue={sp.q}
              placeholder="Nom, email, téléphone, ville…"
              className={`${inputClass} h-10 max-w-xs`}
            />
            <select
              name="suivi"
              defaultValue={sp.suivi ?? ""}
              className={`${inputClass} h-10 max-w-60`}
            >
              <option value="">Tous les parcours</option>
              {Object.entries(suiviOptions).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select
              name="formation"
              defaultValue={sp.formation ?? ""}
              className={`${inputClass} h-10 max-w-60`}
            >
              <option value="">Toutes les formations</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              name="periode"
              defaultValue={sp.periode ?? ""}
              className={`${inputClass} h-10 max-w-44`}
            >
              <option value="">Inscrits : toujours</option>
              <option value="7">Inscrits depuis 7 jours</option>
              <option value="30">Inscrits depuis 30 jours</option>
            </select>
            <select
              name="statut"
              defaultValue={sp.statut ?? ""}
              className={`${inputClass} h-10 max-w-40`}
            >
              <option value="">Tous les statuts</option>
              <option value="actif">Actifs</option>
              <option value="suspendu">Suspendus</option>
            </select>
            <button className={buttonClass("outline")}>Filtrer</button>
            {filtered && (
              <Link href="/admin/apprenants" className={buttonClass("ghost")}>
                Effacer
              </Link>
            )}
          </form>
          <p className="text-sm text-muted">
            {total} apprenant(s){filtered ? " correspondant aux filtres" : ""}.
          </p>
          <Table>
            <thead>
              <tr>
                <Th>Apprenant</Th>
                <Th>Formations</Th>
                <Th>Progression moy.</Th>
                <Th>Certificats</Th>
                <Th>Dernière activité</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {learners.length === 0 && (
                <tr>
                  <Td colSpan={6} className="text-center text-muted">
                    Aucun apprenant.
                  </Td>
                </tr>
              )}
              {learners.map((u) => {
                const avg = u.enrollments.length
                  ? Math.round(
                      u.enrollments.reduce((n, e) => n + e.progressPercent, 0) /
                        u.enrollments.length,
                    )
                  : null;
                const done = u.enrollments.filter((e) => e.completedAt).length;
                const valid = u.certificates.filter(
                  (c) => c.status === "VALID",
                ).length;
                const pending = u.certificates.filter(
                  (c) => c.status === "PENDING_APPROVAL",
                ).length;
                const last = lastActivity(u);
                const isNew = now - u.createdAt.getTime() < 7 * DAY;
                return (
                  <tr key={u.id}>
                    <Td>
                      <Link
                        href={`/admin/apprenants/${u.id}`}
                        className="font-medium text-navy hover:text-sky"
                      >
                        {u.name}
                      </Link>
                      {isNew && (
                        <Badge tone="sky" className="ml-2">
                          nouveau
                        </Badge>
                      )}
                      {u.isDemo && (
                        <Badge tone="gray" className="ml-2">
                          démo
                        </Badge>
                      )}
                      <div className="text-xs text-muted">
                        {u.email}
                        {u.phone ? ` · ${u.phone}` : ""}
                      </div>
                      <div className="text-xs text-muted">
                        Inscrit le {formatDate(u.createdAt)}
                        {u.city ? ` · ${u.city}` : ""}
                      </div>
                    </Td>
                    <Td>
                      {u.enrollments.length}
                      {done ? (
                        <div className="text-xs text-muted">
                          {done} terminée(s)
                        </div>
                      ) : null}
                    </Td>
                    <Td className="min-w-32">
                      {avg === null ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <>
                          <div className="text-sm">{avg} %</div>
                          <ProgressBar value={avg} className="mt-1" />
                        </>
                      )}
                    </Td>
                    <Td>
                      {valid}
                      {pending ? (
                        <div>
                          <Badge tone="amber">{pending} à valider</Badge>
                        </div>
                      ) : null}
                    </Td>
                    <Td className="text-sm text-muted">
                      {last
                        ? formatDate(last, { dateStyle: "medium" })
                        : "Jamais connecté"}
                    </Td>
                    <Td>
                      <Badge tone={u.status === "ACTIVE" ? "green" : "red"}>
                        {u.status === "ACTIVE" ? "Actif" : "Suspendu"}
                      </Badge>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={qs({ page: String(page - 1) })}
                className={buttonClass("outline", "sm")}
              >
                ← Précédent
              </Link>
            )}
            {page * 30 < total && (
              <Link
                href={qs({ page: String(page + 1) })}
                className={buttonClass("outline", "sm")}
              >
                Suivant →
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
