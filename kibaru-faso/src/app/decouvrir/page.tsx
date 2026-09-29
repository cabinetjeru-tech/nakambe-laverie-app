import type { Metadata } from "next";
import { formatFcfa, type CodePromo } from "@/lib/abonnement";
import { CONTACT } from "@/lib/contact";
import { ExempleFiche } from "@/components/exemple-fiche";
import { BoutonInstaller } from "@/components/installer";
import { accountsEnabled, adminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TITRE = "PÉDAGOGUE.IA — Préparez vos cours en quelques minutes";
const DESCRIPTION =
  "L'assistant pédagogique des enseignants du Burkina Faso, de la 6e à la Terminale : fiches, devoirs avec corrigés et barèmes, remédiation, progressions. 24 h d'essai gratuit.";

export const metadata: Metadata = {
  title: TITRE,
  description: DESCRIPTION,
  openGraph: { title: TITRE, description: DESCRIPTION, type: "website", locale: "fr_BF", siteName: "PÉDAGOGUE.IA" },
  twitter: { card: "summary_large_image", title: TITRE, description: DESCRIPTION },
};

async function offres() {
  const defaut = { journalier: 200 as number | null, mensuel: 2000, annuel: 15000, promo: null as CodePromo | null };
  if (!accountsEnabled()) return defaut;
  try {
    const db = adminClient();
    const [{ data: f }, { data: p }] = await Promise.all([
      db.from("formules").select("id, prix_fcfa").eq("active", true),
      db.from("codes_promo").select("*").eq("actif", true).order("remise_pct", { ascending: false }).limit(5),
    ]);
    const prix = Object.fromEntries((f ?? []).map((x) => [x.id, x.prix_fcfa as number]));
    const promo = ((p ?? []) as CodePromo[]).find((x) => !x.expire_le || new Date(x.expire_le) > new Date()) ?? null;
    return { journalier: prix.journalier ?? null, mensuel: prix.mensuel ?? defaut.mensuel, annuel: prix.annuel ?? defaut.annuel, promo };
  } catch {
    return defaut;
  }
}

const GENERATEURS = [
  ["📋", "Fiches pédagogiques", "Compétences, objectifs, déroulement minuté vérifié, trace écrite, évaluation et remédiation."],
  ["📝", "Devoirs et évaluations", "Sujet, corrigé détaillé et barème séparés ; versions A, B, C ; points et calculs vérifiés."],
  ["🔄", "Remédiation", "Hypothèses sur les difficultés, diagnostic, activités progressives et nouvelle vérification."],
  ["📅", "Progressions", "Répartition par semaine et par chapitre, en respectant votre volume horaire."],
] as const;

const ATOUTS = [
  ["🇧🇫", "Pensé pour le Burkina Faso", "Classes de la 6e à la Terminale, exemples de la vie quotidienne, grandes classes."],
  ["🔎", "Transparent", "Ce qui vient des documents officiels est distingué de ce qui est une proposition."],
  ["✅", "Contrôlé", "Durées, totaux de points et calculs du corrigé sont vérifiés automatiquement."],
  ["🖨️", "Prêt à imprimer", "Téléchargement en PDF ou Word, sujet élève sans mention publicitaire."],
] as const;

export default async function Decouvrir({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const brut = typeof q.parrain === "string" ? q.parrain.trim().toUpperCase() : "";
  const parrain = /^[A-Z0-9]{6}$/.test(brut) ? brut : null;
  const inscription = parrain ? `/?parrain=${parrain}` : "/?inscription=1";
  const o = await offres();

  const Cta = ({ className = "" }: { className?: string }) => (
    <a href={inscription} className={`inline-block rounded-xl bg-or px-6 py-3 text-center text-base font-extrabold text-ink shadow hover:brightness-95 ${className}`}>
      🎁 Essayer gratuitement pendant 24 h
    </a>
  );

  return (
    <main className="min-h-dvh bg-white text-ink">
      <section className="bg-faso px-4 pb-14 pt-6 text-white">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.svg" alt="" width={40} height={40} className="h-10 w-10 rounded-lg bg-white/10" />
              <div className="leading-tight">
                <div className="text-lg font-extrabold tracking-wide">PÉDAGOGUE.IA</div>
                <div className="text-xs text-white/80">L&apos;intelligence au service de la pédagogie</div>
              </div>
            </div>
            <a href="/" className="rounded-lg border border-white/40 px-3 py-1.5 text-sm font-semibold hover:bg-white/10">
              Se connecter
            </a>
          </div>
          <h1 className="mt-10 max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">Préparez vos cours, devoirs et corrigés en quelques minutes.</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/90">
            L&apos;assistant pédagogique des enseignants du Burkina Faso, de la 6e à la Terminale. Gagnez des heures chaque semaine et consacrez-les à vos élèves.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Cta />
            <span className="text-sm text-white/85">Sans paiement pour l&apos;essai · Orange Money, Moov Money</span>
          </div>
          <BoutonInstaller className="mt-4" clair />
          {parrain && <p className="mt-4 text-sm text-white/85">Vous êtes invité(e) par un collègue (code {parrain}).</p>}
        </div>
      </section>

      {o.promo && (
        <div className="bg-or-50 px-4 py-3 text-center text-sm font-semibold">
          🎟️ Offre de lancement : code <span className="rounded bg-or px-1.5 py-0.5">{o.promo.code}</span> = -{o.promo.remise_pct} % sur votre premier abonnement
          {o.promo.expire_le ? `, jusqu'au ${new Date(o.promo.expire_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : ""}.
        </div>
      )}

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-2xl font-extrabold text-faso-dark">Quatre générateurs pour votre quotidien</h2>
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {GENERATEURS.map(([i, t, d]) => (
            <div key={t} className="rounded-2xl border-2 border-faso/20 bg-faso-50 p-5">
              <div className="text-3xl">{i}</div>
              <h3 className="mt-2 text-lg font-bold text-faso-dark">{t}</h3>
              <p className="mt-1 text-sm">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-surface px-4 py-12">
        <div className="mx-auto grid max-w-5xl items-start gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-extrabold text-faso-dark">Voyez le résultat avant de vous inscrire</h2>
            <p className="mt-3">
              Vous indiquez la classe, la discipline, la leçon et la durée. En quelques minutes, PÉDAGOGUE.IA rédige une fiche complète, structurée comme celles
              attendues par les conseillers pédagogiques, avec le devoir, le corrigé et le barème.
            </p>
            <ul className="mt-4 space-y-2">
              <li>✅ Durées additionnées et comparées à la durée de la séance</li>
              <li>✅ Points du barème vérifiés, calculs du corrigé contrôlés</li>
              <li>✅ Téléchargement en PDF ou Word, prêt pour la photocopie</li>
            </ul>
            <Cta className="mt-6" />
          </div>
          <ExempleFiche />
        </div>
      </section>

      <section className="px-4 py-12">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-extrabold text-faso-dark">Un assistant sérieux, pas un gadget</h2>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ATOUTS.map(([i, t, d]) => (
              <div key={t} className="rounded-2xl bg-white p-5 shadow-sm">
                <div className="text-2xl">{i}</div>
                <h3 className="mt-2 font-bold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-2xl font-extrabold text-faso-dark">Tarifs simples</h2>
        <div className={`mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 ${o.journalier ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
          <div className="rounded-2xl border-2 border-or bg-or-50 p-5">
            <div className="font-bold">Essai gratuit</div>
            <div className="mt-1 text-3xl font-extrabold">0 FCFA</div>
            <div className="text-sm text-muted">24 h d&apos;accès complet dès l&apos;inscription</div>
          </div>
          {o.journalier && (
            <div className="rounded-2xl border-2 border-faso/30 p-5">
              <div className="font-bold">Pass journalier</div>
              <div className="mt-1 text-3xl font-extrabold text-faso-dark">{formatFcfa(o.journalier)}</div>
              <div className="text-sm text-muted">24 h d&apos;accès complet, pour un besoin ponctuel</div>
            </div>
          )}
          <div className="rounded-2xl border-2 border-faso/30 p-5">
            <div className="font-bold">Mensuel</div>
            <div className="mt-1 text-3xl font-extrabold text-faso-dark">{formatFcfa(o.mensuel)}</div>
            <div className="text-sm text-muted">30 jours d&apos;accès complet</div>
          </div>
          <div className="rounded-2xl border-2 border-faso p-5">
            <div className="font-bold">Annuel · le plus avantageux</div>
            <div className="mt-1 text-3xl font-extrabold text-faso-dark">{formatFcfa(o.annuel)}</div>
            <div className="text-sm text-muted">365 jours, soit {formatFcfa(Math.round(o.annuel / 12))} par mois</div>
          </div>
        </div>
        <div className="mt-8 text-center">
          <Cta />
        </div>
      </section>

      <section className="bg-faso-dark px-4 py-12 text-white">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-2xl font-extrabold">🤝 Parrainez vos collègues, gagnez 20 %</h2>
          <p className="mt-3 max-w-3xl text-white/90">
            Chaque enseignant abonné reçoit un lien personnel. Pour chaque collègue inscrit par ce lien, vous touchez 20 % de chacun de ses paiements, mensuels ou
            annuels, versés par mobile money. Cinq filleuls à l&apos;année couvrent déjà votre propre abonnement.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-12">
        <h2 className="text-2xl font-extrabold text-faso-dark">Questions fréquentes</h2>
        <dl className="mt-5 space-y-4 text-sm">
          {(
            [
              ["Faut-il payer pour essayer ?", "Non : l'inscription donne 24 h d'accès complet, sans paiement."],
              ["Comment payer ?", "Par Orange Money, Moov Money ou carte bancaire, via la plateforme sécurisée CinetPay. Pass journalier (24 h), mensuel ou annuel, au choix."],
              ["Les contenus sont-ils officiels ?", "PÉDAGOGUE.IA s'appuie en priorité sur sa base documentaire et indique toujours ce qui est une proposition. L'enseignant reste maître de ses préparations."],
              ["Mes préparations sont-elles sauvegardées ?", "Oui : vous les retrouvez sur votre téléphone comme sur votre ordinateur, et vous pouvez les télécharger en PDF ou Word."],
            ] as const
          ).map(([t, d]) => (
            <div key={t} className="rounded-xl border border-line p-4">
              <dt className="font-bold">{t}</dt>
              <dd className="mt-1 text-muted">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="border-t border-line px-4 py-8 text-center text-sm text-muted">
        <p>
          <strong className="text-ink">{CONTACT.entreprise}</strong>, {CONTACT.ville} ·{" "}
          <a href={`tel:${CONTACT.telephoneLien}`} className="font-semibold text-faso">
            {CONTACT.telephone}
          </a>{" "}
          ·{" "}
          <a href={`mailto:${CONTACT.email}`} className="font-semibold text-faso">
            {CONTACT.email}
          </a>
        </p>
        <p className="mt-2">
          <a href="/conditions" className="underline underline-offset-2">
            Conditions d&apos;utilisation et de vente · Données personnelles
          </a>
        </p>
        <p className="mt-2">© {new Date().getFullYear()} PÉDAGOGUE.IA — L&apos;intelligence au service de la pédagogie</p>
      </footer>
      <a
        href={`${CONTACT.whatsapp}?text=${encodeURIComponent("Bonjour, j'ai une question sur PÉDAGOGUE.IA.")}`}
        target="_blank"
        rel="noopener"
        className="fixed bottom-4 right-4 z-20 flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-3 text-sm font-bold text-white shadow-lg hover:brightness-95"
        aria-label="Poser une question sur WhatsApp"
      >
        <span aria-hidden className="text-lg leading-none">💬</span> Une question ? WhatsApp
      </a>
    </main>
  );
}
