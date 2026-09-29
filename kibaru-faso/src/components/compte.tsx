"use client";

import { useState } from "react";
import { dureeFormule, formatDate, formatFcfa, type Formule } from "@/lib/abonnement";
import { lienDecouvrir, messagesCampagne } from "@/lib/campagne";
import { CONTACT } from "@/lib/contact";

/** Espace enseignant : connexion, inscription, mot de passe, abonnement et paiement mobile money. */

export type CompteInfo = {
  email: string;
  nom: string | null;
  telephone: string | null;
  etablissement: string | null;
  ville: string | null;
  role: "enseignant" | "admin";
  suspendu: boolean;
  fin: string | null;
  joursRestants: number;
  heuresRestantes: number;
  /** Accès en cours issu de l'essai gratuit de 24 h. */
  essai: boolean;
};
export type PaiementInfo = { transaction_id: string; formule_id: string; montant_fcfa: number; statut: string; moyen: string | null; cree_le: string };
export type ParrainageInfo = {
  code: string;
  taux: number;
  filleuls: number;
  filleulsAbonnes: number;
  due: number;
  versee: number;
  commissions: { montant_fcfa: number; statut: string; cree_le: string; filleul: string }[];
};
export type EtatCompte = {
  compte: CompteInfo | null;
  formules: Formule[];
  paiementDisponible: boolean;
  paiements: PaiementInfo[];
  granted: boolean;
  parrainage?: ParrainageInfo | null;
  /** Générations utilisées aujourd'hui et limite (null = illimité). */
  quota?: { limite: number | null; utilisees: number } | null;
};

/** Lien d'invitation d'un parrain : page de présentation (aperçu soigné sur WhatsApp), puis inscription parrainée. */
export function lienParrainage(code: string): string {
  return lienDecouvrir(code, typeof window !== "undefined" ? window.location.origin : undefined);
}

const inputCls = "mt-1 w-full rounded-lg border border-line px-3 py-2 focus:border-faso focus:outline-none";
const STATUTS: Record<string, string> = { reussi: "Réussi", en_attente: "En attente", echoue: "Échoué", annule: "Annulé" };


export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9 rounded-lg" />
      <div className="leading-tight">
        <div className="text-[16px] font-extrabold tracking-wide text-faso-dark">PÉDAGOGUE.IA</div>
        <div className="text-[11px] text-muted">L&apos;intelligence au service de la pédagogie</div>
      </div>
    </div>
  );
}

/** Coordonnées de l'entreprise porteuse : assistance, abonnement, paiement. */
export function Contact({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-muted ${className}`}>
      Assistance et abonnements : <strong className="text-ink">{CONTACT.entreprise}</strong>, {CONTACT.ville} ·{" "}
      <a href={`tel:${CONTACT.telephoneLien}`} className="whitespace-nowrap font-semibold text-faso underline underline-offset-2">
        {CONTACT.telephone}
      </a>{" "}
      ·{" "}
      <a href={`mailto:${CONTACT.email}`} className="font-semibold text-faso underline underline-offset-2">
        {CONTACT.email}
      </a>{" "}
      ·{" "}
      <a href="/conditions" target="_blank" className="underline underline-offset-2">
        Conditions
      </a>
    </p>
  );
}

type Vue = "connexion" | "inscription" | "oubli" | "nouveau";

export function AuthScreen({ onDone, initial = "connexion", notice, parrain }: { onDone: () => void; initial?: Vue; notice?: string; parrain?: string | null }) {
  const [vue, setVue] = useState<Vue>(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(notice ?? null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      if ((vue === "inscription" || vue === "nouveau") && password.length < 8) throw new Error("Mot de passe trop court : au moins 8 caractères.");
      const body: Record<string, string> =
        vue === "connexion"
          ? { action: "connexion", email, password }
          : vue === "inscription"
            ? { action: "inscription", email, password, nom, ...(parrain ? { parrain } : {}) }
            : vue === "oubli"
              ? { action: "oubli", email }
              : { action: "nouveau", password };
      const j = await auth(body);
      if (vue === "inscription" && !j.session) {
        setInfo("Compte créé. Ouvrez le lien de confirmation envoyé à votre adresse e-mail (pensez aux courriers indésirables), puis connectez-vous.");
        setVue("connexion");
      } else if (vue === "oubli") {
        setInfo("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
        setVue("connexion");
      } else {
        if (vue === "nouveau") window.history.replaceState(null, "", "/");
        onDone();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const titres: Record<Vue, string> = {
    connexion: "Connexion à votre espace",
    inscription: "Créer mon espace enseignant",
    oubli: "Mot de passe oublié",
    nouveau: "Choisir un nouveau mot de passe",
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-faso-50 px-4 py-8">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 shadow-sm">
        <Logo />
        <h1 className="mt-5 text-lg font-bold text-faso-dark">{titres[vue]}</h1>
        {vue === "inscription" && (
          <>
            <p className="mt-2 rounded-lg border border-or/50 bg-or-50 p-2.5 text-sm font-semibold text-ink">
              🎁 24 h d&apos;essai gratuit, sans paiement : tous les générateurs dès votre inscription.
            </p>
            <p className="mt-2 text-sm text-muted">Votre espace personnel : vos préparations sont sauvegardées et retrouvées sur tous vos appareils.</p>
            {parrain && <p className="mt-2 text-xs text-faso-dark">Invitation d&apos;un collègue : code parrain <strong>{parrain}</strong>.</p>}
          </>
        )}
        {info && <p className="mt-3 rounded-lg bg-faso-50 p-2.5 text-sm text-faso-dark">{info}</p>}
        {vue === "inscription" && (
          <label className="mt-4 block text-sm font-medium">
            Nom et prénom
            <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" className={inputCls} />
          </label>
        )}
        {vue !== "nouveau" && (
          <label className="mt-4 block text-sm font-medium">
            Adresse e-mail
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className={inputCls} />
          </label>
        )}
        {vue !== "oubli" && (
          <label className="mt-4 block text-sm font-medium">
            {vue === "nouveau" ? "Nouveau mot de passe" : "Mot de passe"}
            <input
              type="password"
              required
              minLength={vue === "connexion" ? undefined : 8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={vue === "connexion" ? "current-password" : "new-password"}
              className={inputCls}
            />
          </label>
        )}
        {error && <p className="mt-3 text-sm text-rouge">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 w-full rounded-lg bg-faso py-2.5 font-semibold text-white hover:bg-faso-dark disabled:opacity-50">
          {busy ? "Patientez…" : vue === "connexion" ? "Se connecter" : vue === "inscription" ? "Créer mon compte" : vue === "oubli" ? "Recevoir le lien" : "Enregistrer"}
        </button>
        <div className="mt-4 space-y-1.5 text-center text-sm">
          {vue === "connexion" && (
            <>
              <button type="button" onClick={() => setVue("inscription")} className="block w-full font-semibold text-faso underline underline-offset-2">
                Pas encore de compte ? Créer mon espace (24 h gratuites)
              </button>
              <button type="button" onClick={() => setVue("oubli")} className="block w-full text-muted underline underline-offset-2">
                Mot de passe oublié
              </button>
            </>
          )}
          {(vue === "inscription" || vue === "oubli") && (
            <button type="button" onClick={() => setVue("connexion")} className="block w-full text-faso underline underline-offset-2">
              J&apos;ai déjà un compte : me connecter
            </button>
          )}
        </div>
        {vue === "inscription" && (
          <p className="mt-3 text-center text-xs text-muted">
            En créant un compte, vous acceptez les{" "}
            <a href="/conditions" target="_blank" className="underline">
              conditions d&apos;utilisation et de vente
            </a>
            .
          </p>
        )}
        <Contact className="mt-5 border-t border-line pt-3 text-center" />
      </form>
    </div>
  );
}

/** Appel au serveur de l'application (jamais directement à Supabase). */
async function auth(body: Record<string, string>): Promise<{ ok?: boolean; session?: boolean }> {
  const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!r) throw new Error("Connexion impossible. Vérifiez votre connexion Internet et réessayez.");
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; session?: boolean; error?: string };
  if (!r.ok) throw new Error(j.error ?? "Opération impossible pour le moment.");
  return j;
}

export async function deconnexion() {
  await auth({ action: "deconnexion" }).catch(() => null);
  window.location.href = "/";
}

/** Abonnement, paiement, profil. Utilisé en page (abonnement requis) ou en fenêtre (« Mon compte »). */
export function ComptePanel({ etat, onChange, message }: { etat: EtatCompte; onChange: () => void; message?: string | null }) {
  const c = etat.compte!;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [profil, setProfil] = useState({ nom: c.nom ?? "", telephone: c.telephone ?? "", etablissement: c.etablissement ?? "", ville: c.ville ?? "" });
  const [saved, setSaved] = useState(false);
  const actif = !!c.fin && new Date(c.fin) > new Date();
  const [codeSaisi, setCodeSaisi] = useState("");
  const [promo, setPromo] = useState<{ code: string; remise_pct: number; prix: Record<string, number> } | null>(null);
  const [promoMsg, setPromoMsg] = useState<string | null>(null);

  async function appliquerPromo(e: React.FormEvent) {
    e.preventDefault();
    setPromoMsg(null);
    const r = await fetch(`/api/promo?code=${encodeURIComponent(codeSaisi)}`).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { code?: string; remise_pct?: number; prix?: Record<string, number>; error?: string };
    if (r?.ok && j.code) {
      setPromo({ code: j.code, remise_pct: j.remise_pct!, prix: j.prix ?? {} });
      setPromoMsg(`Code ${j.code} appliqué : -${j.remise_pct} %.`);
    } else {
      setPromo(null);
      setPromoMsg(j?.error ?? "Code promo invalide.");
    }
  }

  async function payer(formule: string) {
    setBusy(formule);
    setError(null);
    const r = await fetch("/api/paiement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formule, ...(promo ? { promo: promo.code } : {}) }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { url?: string; error?: string };
    if (r?.ok && j.url) window.location.href = j.url;
    else {
      setBusy(null);
      setError(j?.error ?? "Paiement impossible pour le moment.");
    }
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    setBusy("profil");
    const r = await fetch("/api/compte", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(profil) });
    setBusy(null);
    setSaved(r.ok);
    if (r.ok) onChange();
  }

  return (
    <div className="space-y-5">
      {message && <p className="rounded-lg border border-or/40 bg-or/10 p-3 text-sm">{message}</p>}
      {c.suspendu && <p className="rounded-lg bg-rouge-50 p-3 text-sm text-rouge">Votre compte est suspendu. Contactez {CONTACT.entreprise} au {CONTACT.telephone}.</p>}

      <section>
        <h3 className="font-bold text-faso-dark">Mon abonnement</h3>
        {c.role === "admin" ? (
          <p className="mt-1 text-sm">Compte administrateur : accès complet, sans abonnement.</p>
        ) : actif && c.essai ? (
          <p className="mt-1 rounded-lg border border-or/50 bg-or-50 p-2.5 text-sm">
            🎁 <strong>Essai gratuit en cours</strong> : il vous reste {c.heuresRestantes} heure{c.heuresRestantes > 1 ? "s" : ""}. Abonnez-vous
            maintenant pour continuer sans interruption : les jours payés s&apos;ajoutent après l&apos;essai.
          </p>
        ) : actif ? (
          <p className="mt-1 text-sm">
            ✅ Actif jusqu&apos;au <strong>{formatDate(c.fin!)}</strong> ({c.joursRestants} jour{c.joursRestants > 1 ? "s" : ""} restant{c.joursRestants > 1 ? "s" : ""}). Un
            nouveau paiement prolonge l&apos;abonnement sans perdre de jours.
          </p>
        ) : (
          <p className="mt-1 text-sm">
            {c.fin ? `Abonnement terminé le ${formatDate(c.fin)}.` : "Aucun abonnement en cours."} Choisissez une formule pour utiliser PÉDAGOGUE.IA.
          </p>
        )}
        <div className={`mt-3 grid grid-cols-1 gap-3 ${etat.formules.length >= 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          {etat.formules.map((f) => (
            <div key={f.id} className="rounded-xl border-2 border-faso/30 bg-white p-4">
              <div className="font-semibold">{f.libelle}</div>
              {promo?.prix[f.id] !== undefined && promo.prix[f.id] !== f.prix_fcfa ? (
                <div className="mt-1">
                  <span className="text-sm text-muted line-through">{formatFcfa(f.prix_fcfa)}</span>{" "}
                  <span className="text-2xl font-extrabold text-faso-dark">{formatFcfa(promo.prix[f.id]!)}</span>
                </div>
              ) : (
                <div className="mt-1 text-2xl font-extrabold text-faso-dark">{formatFcfa(f.prix_fcfa)}</div>
              )}
              <div className="text-xs text-muted">
                {dureeFormule(f.duree_jours)} d&apos;accès complet
                {f.quota_jour ? ` · ${f.quota_jour} générations par jour` : ""}
              </div>
              <button
                type="button"
                disabled={!!busy || !etat.paiementDisponible || c.suspendu}
                onClick={() => void payer(f.id)}
                className="mt-3 w-full rounded-lg bg-faso py-2 text-sm font-semibold text-white hover:bg-faso-dark disabled:opacity-50"
              >
                {busy === f.id ? "Redirection…" : actif && !c.essai ? "Prolonger" : "S'abonner"}
              </button>
            </div>
          ))}
        </div>
        {etat.quota && etat.quota.limite !== null && actif && (
          <div className="mt-3 rounded-lg border border-line p-3 text-sm">
            <div className="flex justify-between">
              <span>Générations aujourd&apos;hui</span>
              <strong>
                {etat.quota.utilisees} / {etat.quota.limite}
              </strong>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-faso-50">
              <div
                className={`h-full rounded-full ${etat.quota.utilisees >= etat.quota.limite ? "bg-rouge" : "bg-faso"}`}
                style={{ width: `${Math.min(100, (etat.quota.utilisees / Math.max(1, etat.quota.limite)) * 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">Le compteur repart à zéro chaque jour à minuit. Les questions de précision ne sont pas comptées.</p>
          </div>
        )}
        {c.role !== "admin" && (
          <form onSubmit={appliquerPromo} className="mt-3 flex flex-wrap items-center gap-2">
            <input
              value={codeSaisi}
              onChange={(e) => setCodeSaisi(e.target.value.toUpperCase())}
              placeholder="Code promo (ex. LANCEMENT)"
              aria-label="Code promo"
              className="min-w-0 flex-1 rounded-lg border border-line px-3 py-2 text-sm uppercase focus:border-faso focus:outline-none"
            />
            <button type="submit" disabled={!codeSaisi.trim()} className="rounded-lg border border-faso px-3 py-2 text-sm font-semibold text-faso disabled:opacity-40">
              Appliquer
            </button>
            {promoMsg && <span className={`w-full text-sm ${promo ? "text-faso" : "text-rouge"}`}>{promoMsg}</span>}
          </form>
        )}
        <p className="mt-2 text-xs text-muted">
          {etat.paiementDisponible
            ? "Paiement sécurisé par CinetPay : Orange Money, Moov Money ou carte bancaire. Vous serez redirigé vers la page de paiement puis ramené ici."
            : "Le paiement en ligne n'est pas encore ouvert : contactez-nous pour activer votre abonnement."}
        </p>
        <Contact className="mt-1" />
        {error && <p className="mt-2 text-sm text-rouge">{error}</p>}
      </section>

      {etat.parrainage && <Parrainage p={etat.parrainage} telephone={c.telephone} />}

      {etat.paiements.length > 0 && (
        <section>
          <h3 className="font-bold text-faso-dark">Mes paiements</h3>
          <ul className="mt-2 divide-y divide-line rounded-lg border border-line text-sm">
            {etat.paiements.map((p) => (
              <li key={p.transaction_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  {formatDate(p.cree_le)} · {formatFcfa(p.montant_fcfa)}
                  {p.moyen ? ` · ${p.moyen}` : ""}
                </span>
                <span className={p.statut === "reussi" ? "font-semibold text-faso" : p.statut === "en_attente" ? "text-muted" : "text-rouge"}>
                  {STATUTS[p.statut] ?? p.statut}
                  {p.statut === "reussi" && (
                    <a href={`/recu/${encodeURIComponent(p.transaction_id)}`} target="_blank" className="ml-2 font-normal underline underline-offset-2">
                      Reçu
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="font-bold text-faso-dark">Mon profil</h3>
        <p className="text-xs text-muted">{c.email}</p>
        <form onSubmit={enregistrer} className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              ["nom", "Nom et prénom", "name"],
              ["telephone", "Téléphone (mobile money)", "tel"],
              ["etablissement", "Établissement", "organization"],
              ["ville", "Ville", "address-level2"],
            ] as const
          ).map(([k, label, auto]) => (
            <label key={k} className="text-sm font-medium">
              {label}
              <input value={profil[k]} autoComplete={auto} onChange={(e) => (setSaved(false), setProfil({ ...profil, [k]: e.target.value }))} className={inputCls} />
            </label>
          ))}
          <div className="flex items-center gap-3 sm:col-span-2">
            <button type="submit" disabled={busy === "profil"} className="rounded-lg border border-faso px-4 py-2 text-sm font-semibold text-faso disabled:opacity-50">
              Enregistrer le profil
            </button>
            {saved && <span className="text-sm text-faso">Enregistré.</span>}
          </div>
        </form>
      </section>

      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        {c.role === "admin" && (
          <a href="/admin" className="rounded-lg bg-faso-dark px-4 py-2 text-sm font-semibold text-white">
            Espace administration
          </a>
        )}
        <button type="button" onClick={() => void deconnexion()} className="rounded-lg border border-line px-4 py-2 text-sm">
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

const STATUTS_COM: Record<string, string> = { due: "À verser", versee: "Versée", annulee: "Annulée" };

/** Parrainage : lien personnel, partage WhatsApp, filleuls et commissions (20 % de chaque paiement d'un filleul). */
function Parrainage({ p, telephone }: { p: ParrainageInfo; telephone: string | null }) {
  const [copie, setCopie] = useState(false);
  const lien = lienParrainage(p.code);
  const message = messagesCampagne(lien)[0]!.texte;
  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 2500);
    } catch {
      prompt("Copiez votre lien :", lien);
    }
  }
  return (
    <section className="rounded-xl border-2 border-faso/30 bg-faso-50 p-4">
      <h3 className="font-bold text-faso-dark">🤝 Parrainage : gagnez {p.taux} % sur chaque abonnement de vos filleuls</h3>
      <p className="mt-1 text-sm">
        Partagez votre lien avec vos collègues. Ils profitent de 24 h gratuites, et vous touchez <strong>{p.taux} %</strong> de chacun de leurs paiements,
        mensuels ou annuels, tant que votre propre abonnement est actif.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-line bg-white px-3 py-2 text-sm">{lien}</code>
        <button type="button" onClick={() => void copier()} className="rounded-lg border border-faso bg-white px-3 py-2 text-sm font-semibold text-faso">
          {copie ? "Copié ✓" : "Copier"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[#25D366] px-3 py-2 text-sm font-semibold text-white"
        >
          Partager sur WhatsApp
        </a>
      </div>
      <p className="mt-1 text-xs text-muted">
        Votre code : <strong>{p.code}</strong>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        {(
          [
            ["Filleuls inscrits", String(p.filleuls)],
            ["Filleuls abonnés", String(p.filleulsAbonnes)],
            ["À recevoir", formatFcfa(p.due)],
            ["Déjà reçu", formatFcfa(p.versee)],
          ] as const
        ).map(([l, v]) => (
          <div key={l} className="rounded-lg bg-white p-2">
            <div className="text-lg font-extrabold text-faso-dark">{v}</div>
            <div className="text-[11px] text-muted">{l}</div>
          </div>
        ))}
      </div>
      {p.commissions.length > 0 && (
        <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white text-sm">
          {p.commissions.map((x, i) => (
            <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-1.5">
              <span>
                {formatDate(x.cree_le)} · {x.filleul}
              </span>
              <span className={x.statut === "versee" ? "font-semibold text-faso" : "text-ink"}>
                {formatFcfa(x.montant_fcfa)} · {STATUTS_COM[x.statut] ?? x.statut}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">
        Les commissions sont versées par mobile money par {CONTACT.entreprise}
        {telephone ? ` au ${telephone}` : " : renseignez votre numéro de téléphone dans « Mon profil »"}.
      </p>
    </section>
  );
}

/** Page affichée quand l'enseignant est connecté mais sans abonnement actif. */
export function AbonnementScreen({ etat, onChange, message }: { etat: EtatCompte; onChange: () => void; message?: string | null }) {
  return (
    <div className="min-h-dvh bg-faso-50 px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-sm">
        <Logo />
        <h1 className="mt-5 text-xl font-bold text-faso-dark">Bienvenue{etat.compte?.nom ? `, ${etat.compte.nom}` : ""} !</h1>
        <p className="mt-1 text-sm text-muted">
          {etat.compte?.fin
            ? "Votre essai gratuit ou votre abonnement est terminé. Abonnez-vous pour retrouver tous les générateurs : fiches pédagogiques, devoirs avec corrigés, remédiation, progressions."
            : "Fiches pédagogiques, devoirs avec corrigés, remédiation, progressions : abonnez-vous pour accéder à tous les générateurs de PÉDAGOGUE.IA."}
        </p>
        <div className="mt-5">
          <ComptePanel etat={etat} onChange={onChange} message={message} />
        </div>
      </div>
    </div>
  );
}
