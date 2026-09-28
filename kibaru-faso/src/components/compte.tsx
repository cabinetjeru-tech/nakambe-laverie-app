"use client";

import { useState } from "react";
import { formatDate, formatFcfa, type Formule } from "@/lib/abonnement";
import { browserClient } from "@/lib/supabase/browser";

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
};
export type PaiementInfo = { transaction_id: string; formule_id: string; montant_fcfa: number; statut: string; moyen: string | null; cree_le: string };
export type EtatCompte = { compte: CompteInfo | null; formules: Formule[]; paiementDisponible: boolean; paiements: PaiementInfo[]; granted: boolean };

const inputCls = "mt-1 w-full rounded-lg border border-line px-3 py-2 focus:border-faso focus:outline-none";
const STATUTS: Record<string, string> = { reussi: "Réussi", en_attente: "En attente", echoue: "Échoué", annule: "Annulé" };

function traduire(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou mot de passe incorrect.";
  if (m.includes("email not confirmed")) return "Adresse e-mail non confirmée : ouvrez le lien reçu par e-mail.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Un compte existe déjà avec cette adresse : connectez-vous.";
  if (m.includes("password should be") || m.includes("weak")) return "Mot de passe trop faible : au moins 8 caractères, avec lettres et chiffres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Réessayez dans quelques minutes.";
  if (m.includes("fetch")) return "Connexion au service impossible. Vérifiez votre connexion Internet.";
  return message;
}

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

type Vue = "connexion" | "inscription" | "oubli" | "nouveau";

export function AuthScreen({ onDone, initial = "connexion", notice }: { onDone: () => void; initial?: Vue; notice?: string }) {
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
    const sb = browserClient();
    const callback = `${window.location.origin}/auth/callback`;
    try {
      if (vue === "connexion") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onDone();
      } else if (vue === "inscription") {
        if (password.length < 8) throw new Error("Mot de passe trop faible : au moins 8 caractères.");
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { data: { nom: nom.trim() }, emailRedirectTo: callback } });
        if (error) throw error;
        if (data.session) onDone();
        else {
          setInfo("Compte créé. Ouvrez le lien de confirmation envoyé à votre adresse e-mail, puis connectez-vous.");
          setVue("connexion");
        }
      } else if (vue === "oubli") {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${callback}?next=${encodeURIComponent("/?reinit=1")}` });
        if (error) throw error;
        setInfo("Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d'être envoyé.");
        setVue("connexion");
      } else {
        if (password.length < 8) throw new Error("Mot de passe trop faible : au moins 8 caractères.");
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        window.history.replaceState(null, "", "/");
        onDone();
      }
    } catch (err) {
      setError(traduire((err as Error).message));
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
          <p className="mt-1 text-sm text-muted">Votre espace personnel : vos préparations sont sauvegardées et retrouvées sur tous vos appareils.</p>
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
                Pas encore de compte ? Créer mon espace
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
      </form>
    </div>
  );
}

export async function deconnexion() {
  await browserClient().auth.signOut();
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

  async function payer(formule: string) {
    setBusy(formule);
    setError(null);
    const r = await fetch("/api/paiement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ formule }) }).catch(() => null);
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
      {c.suspendu && <p className="rounded-lg bg-rouge-50 p-3 text-sm text-rouge">Votre compte est suspendu. Contactez l&apos;administrateur de PÉDAGOGUE.IA.</p>}

      <section>
        <h3 className="font-bold text-faso-dark">Mon abonnement</h3>
        {c.role === "admin" ? (
          <p className="mt-1 text-sm">Compte administrateur : accès complet, sans abonnement.</p>
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
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {etat.formules.map((f) => (
            <div key={f.id} className="rounded-xl border-2 border-faso/30 bg-white p-4">
              <div className="font-semibold">{f.libelle}</div>
              <div className="mt-1 text-2xl font-extrabold text-faso-dark">{formatFcfa(f.prix_fcfa)}</div>
              <div className="text-xs text-muted">{f.duree_jours} jours d&apos;accès complet</div>
              <button
                type="button"
                disabled={!!busy || !etat.paiementDisponible || c.suspendu}
                onClick={() => void payer(f.id)}
                className="mt-3 w-full rounded-lg bg-faso py-2 text-sm font-semibold text-white hover:bg-faso-dark disabled:opacity-50"
              >
                {busy === f.id ? "Redirection…" : actif ? "Prolonger" : "Payer par mobile money"}
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {etat.paiementDisponible
            ? "Paiement sécurisé par CinetPay : Orange Money, Moov Money. Vous serez redirigé vers la page de paiement puis ramené ici."
            : "Le paiement en ligne n'est pas encore ouvert : contactez l'administrateur pour activer votre abonnement."}
        </p>
        {error && <p className="mt-2 text-sm text-rouge">{error}</p>}
      </section>

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
                <span className={p.statut === "reussi" ? "font-semibold text-faso" : p.statut === "en_attente" ? "text-muted" : "text-rouge"}>{STATUTS[p.statut] ?? p.statut}</span>
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

/** Page affichée quand l'enseignant est connecté mais sans abonnement actif. */
export function AbonnementScreen({ etat, onChange, message }: { etat: EtatCompte; onChange: () => void; message?: string | null }) {
  return (
    <div className="min-h-dvh bg-faso-50 px-4 py-8">
      <div className="mx-auto max-w-2xl rounded-2xl border border-line bg-white p-6 shadow-sm">
        <Logo />
        <h1 className="mt-5 text-xl font-bold text-faso-dark">Bienvenue{etat.compte?.nom ? `, ${etat.compte.nom}` : ""} !</h1>
        <p className="mt-1 text-sm text-muted">
          Fiches pédagogiques, devoirs avec corrigés, remédiation, progressions : abonnez-vous pour accéder à tous les générateurs de PÉDAGOGUE.IA.
        </p>
        <div className="mt-5">
          <ComptePanel etat={etat} onChange={onChange} message={message} />
        </div>
      </div>
    </div>
  );
}
