"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDate, formatFcfa, type Formule } from "@/lib/abonnement";
import { deconnexion, Logo } from "./compte";

/** Espace administration : tableau de bord, enseignants, paiements, tarifs. */

type Enseignant = {
  id: string;
  email: string;
  nom: string | null;
  telephone: string | null;
  etablissement: string | null;
  ville: string | null;
  role: "enseignant" | "admin";
  suspendu: boolean;
  cree_le: string;
  fin: string | null;
  actif: boolean;
  essai: boolean;
  preparations: number;
  code_parrainage: string;
  parrain_id: string | null;
  filleuls: number;
};
type Commission = {
  id: string;
  parrain: string;
  telephone: string | null;
  filleul: string;
  montant_fcfa: number;
  taux: number;
  statut: "due" | "versee" | "annulee";
  versee_le: string | null;
  reference_versement: string | null;
  cree_le: string;
};
type Paiement = { id: string; email: string; formule_id: string; montant_fcfa: number; statut: string; moyen: string | null; transaction_id: string; cree_le: string };
type Donnees = {
  stats: {
    enseignants: number;
    abonnesActifs: number;
    enEssai: number;
    parraines: number;
    commissionsDues: number;
    preparations: number;
    recettesMois: number;
    recettesTotal: number;
  };
  commissions: Commission[];
  enseignants: Enseignant[];
  paiements: Paiement[];
  formules: Formule[];
  moi: string;
};
type Onglet = "tableau" | "enseignants" | "paiements" | "parrainage" | "tarifs";
/** Objectif de lancement : 5 000 enseignants abonnés. */
const OBJECTIF_ABONNES = 5000;

const STATUTS: Record<string, string> = { reussi: "Réussi", en_attente: "En attente", echoue: "Échoué", annule: "Annulé" };
const input = "rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";

export function AdminApp() {
  const [d, setD] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<{ status: number; message: string } | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("tableau");
  const [message, setMessage] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const r = await fetch("/api/admin").catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as Donnees & { error?: string };
    if (!r?.ok) setErreur({ status: r?.status ?? 0, message: j?.error ?? "Chargement impossible." });
    else setD(j);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function action(body: Record<string, unknown>, ok: string) {
    setMessage(null);
    const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { error?: string; statut?: string; fin?: string };
    setMessage(r.ok ? `${ok}${j.statut ? ` : ${STATUTS[j.statut] ?? j.statut}` : ""}${j.fin ? ` — accès jusqu'au ${formatDate(j.fin)}` : ""}.` : `Erreur : ${j.error ?? "action impossible"}`);
    await charger();
  }

  if (erreur)
    return (
      <div className="flex min-h-dvh items-center justify-center bg-faso-50 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6 text-center">
          <Logo />
          <p className="mt-5 text-sm">{erreur.status === 401 ? "Connectez-vous avec un compte administrateur." : erreur.message}</p>
          <a href="/" className="mt-4 inline-block rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white">
            Retour à l&apos;application
          </a>
        </div>
      </div>
    );
  if (!d) return <div className="flex min-h-dvh items-center justify-center text-muted">Chargement…</div>;

  const onglets: [Onglet, string][] = [
    ["tableau", "Tableau de bord"],
    ["enseignants", `Enseignants (${d.stats.enseignants})`],
    ["paiements", "Paiements"],
    ["parrainage", `Parrainage${d.stats.commissionsDues ? " •" : ""}`],
    ["tarifs", "Tarifs"],
  ];

  return (
    <div className="min-h-dvh bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3">
        <Logo />
        <span className="rounded-full bg-faso-dark px-2.5 py-0.5 text-xs font-semibold text-white">Administration</span>
        <div className="ml-auto flex gap-2">
          <a href="/" className="rounded-lg border border-line px-3 py-1.5 text-sm">
            ← Application
          </a>
          <button type="button" onClick={() => void deconnexion()} className="rounded-lg border border-line px-3 py-1.5 text-sm">
            Déconnexion
          </button>
        </div>
      </header>
      <nav className="flex gap-1 overflow-x-auto border-b border-line bg-white px-4">
        {onglets.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setOnglet(k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold ${onglet === k ? "border-faso text-faso-dark" : "border-transparent text-muted"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <main className="mx-auto max-w-6xl p-4">
        {message && <p className="mb-4 rounded-lg border border-faso/30 bg-faso-50 p-3 text-sm">{message}</p>}
        {onglet === "tableau" && <Tableau d={d} />}
        {onglet === "enseignants" && <Enseignants d={d} action={action} />}
        {onglet === "paiements" && <Paiements d={d} action={action} />}
        {onglet === "parrainage" && <ParrainageAdmin d={d} action={action} />}
        {onglet === "tarifs" && <Tarifs d={d} action={action} />}
      </main>
    </div>
  );
}

function Carte({ label, valeur, detail }: { label: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-extrabold text-faso-dark">{valeur}</div>
      {detail && <div className="text-xs text-muted">{detail}</div>}
    </div>
  );
}

function Tableau({ d }: { d: Donnees }) {
  const s = d.stats;
  const recents = d.paiements.filter((p) => p.statut === "reussi").slice(0, 5);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-bold text-faso-dark">Objectif : {OBJECTIF_ABONNES.toLocaleString("fr-FR")} enseignants abonnés</h2>
          <span className="text-sm font-semibold">
            {s.abonnesActifs.toLocaleString("fr-FR")} / {OBJECTIF_ABONNES.toLocaleString("fr-FR")} ({((s.abonnesActifs / OBJECTIF_ABONNES) * 100).toFixed(1).replace(".", ",")} %)
          </span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-faso-50" role="progressbar" aria-valuemin={0} aria-valuemax={OBJECTIF_ABONNES} aria-valuenow={s.abonnesActifs}>
          <div className="h-full rounded-full bg-faso" style={{ width: `${Math.min(100, (s.abonnesActifs / OBJECTIF_ABONNES) * 100)}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Carte label="Enseignants inscrits" valeur={String(s.enseignants)} detail={`${s.parraines} via parrainage`} />
        <Carte label="Abonnés payants actifs" valeur={String(s.abonnesActifs)} detail={s.enseignants ? `${Math.round((s.abonnesActifs / s.enseignants) * 100)} % des inscrits` : undefined} />
        <Carte label="En essai gratuit (24 h)" valeur={String(s.enEssai)} detail="à convertir en abonnés" />
        <Carte label="Recettes du mois" valeur={formatFcfa(s.recettesMois)} detail={`Total : ${formatFcfa(s.recettesTotal)}`} />
        <Carte label="Commissions à verser" valeur={formatFcfa(s.commissionsDues)} detail="onglet Parrainage" />
        <Carte label="Préparations sauvegardées" valeur={String(s.preparations)} />
      </div>
      <div className="rounded-xl border border-line bg-white p-4">
        <h2 className="font-bold text-faso-dark">Derniers paiements réussis</h2>
        {recents.length ? (
          <ul className="mt-2 divide-y divide-line text-sm">
            {recents.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{p.email}</span>
                <span>
                  {formatFcfa(p.montant_fcfa)} · {formatDate(p.cree_le)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">Aucun paiement pour le moment.</p>
        )}
      </div>
    </div>
  );
}

function Enseignants({ d, action }: { d: Donnees; action: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "actifs" | "inactifs">("tous");
  const [jours, setJours] = useState<Record<string, string>>({});
  const liste = useMemo(() => {
    const n = q.trim().toLowerCase();
    return d.enseignants.filter(
      (e) =>
        (filtre === "tous" || (filtre === "actifs") === (e.actif || e.role === "admin")) &&
        (!n || [e.email, e.nom, e.etablissement, e.ville, e.telephone].some((x) => x?.toLowerCase().includes(n))),
    );
  }, [d.enseignants, q, filtre]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher (nom, e-mail, établissement…)" className={`${input} min-w-0 flex-1`} />
        <select value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)} className={input}>
          <option value="tous">Tous</option>
          <option value="actifs">Abonnement actif</option>
          <option value="inactifs">Sans abonnement</option>
        </select>
      </div>
      <div className="space-y-2">
        {liste.map((e) => (
          <div key={e.id} className="rounded-xl border border-line bg-white p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-semibold">
                  {e.nom || "—"} {e.role === "admin" && <span className="ml-1 rounded bg-faso-dark px-1.5 py-0.5 text-[10px] text-white">ADMIN</span>}
                  {e.suspendu && <span className="ml-1 rounded bg-rouge px-1.5 py-0.5 text-[10px] text-white">SUSPENDU</span>}
                </div>
                <div className="text-muted">
                  {e.email}
                  {e.telephone ? ` · ${e.telephone}` : ""}
                </div>
                <div className="text-muted">{[e.etablissement, e.ville].filter(Boolean).join(" · ") || "Établissement non renseigné"}</div>
              </div>
              <div className="text-right">
                <div className={e.actif || e.role === "admin" ? "font-semibold text-faso" : "text-rouge"}>
                  {e.essai ? "🎁 En essai gratuit" : e.actif ? `Actif jusqu'au ${formatDate(e.fin!)}` : e.role === "admin" ? "Accès complet (administration)" : e.fin ? `Expiré le ${formatDate(e.fin)}` : "Jamais abonné"}
                </div>
                <div className="text-xs text-muted">
                  Inscrit le {formatDate(e.cree_le)} · {e.preparations} préparation{e.preparations > 1 ? "s" : ""}
                  <br />
                  Code {e.code_parrainage} · {e.filleuls} filleul{e.filleuls > 1 ? "s" : ""}
                  {e.parrain_id ? ` · parrainé par ${d.enseignants.find((x) => x.id === e.parrain_id)?.email ?? "—"}` : ""}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-line pt-2">
              <span className="text-xs text-muted">Accorder :</span>
              {[30, 90, 365].map((n) => (
                <button key={n} type="button" onClick={() => void action({ action: "activer", utilisateur: e.id, jours: n }, `${n} jours accordés à ${e.email}`)} className="rounded-lg border border-faso px-2 py-1 text-xs font-semibold text-faso">
                  +{n} j
                </button>
              ))}
              <input
                inputMode="numeric"
                value={jours[e.id] ?? ""}
                onChange={(x) => setJours({ ...jours, [e.id]: x.target.value })}
                placeholder="jours"
                className="w-16 rounded-lg border border-line px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={!Number(jours[e.id])}
                onClick={() => void action({ action: "activer", utilisateur: e.id, jours: Number(jours[e.id]) }, `${jours[e.id]} jours accordés à ${e.email}`)}
                className="rounded-lg border border-line px-2 py-1 text-xs disabled:opacity-40"
              >
                OK
              </button>
              {e.id !== d.moi && (
                <span className="ml-auto flex gap-2">
                  <button
                    type="button"
                    onClick={() => void action({ action: "suspendre", utilisateur: e.id, suspendu: !e.suspendu }, e.suspendu ? `Compte réactivé` : `Compte suspendu`)}
                    className="rounded-lg border border-line px-2 py-1 text-xs"
                  >
                    {e.suspendu ? "Réactiver" : "Suspendre"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (e.role === "admin" || confirm(`Donner les droits d'administration à ${e.email} ?`))
                        void action({ action: "role", utilisateur: e.id, role: e.role === "admin" ? "enseignant" : "admin" }, "Rôle modifié");
                    }}
                    className="rounded-lg border border-line px-2 py-1 text-xs"
                  >
                    {e.role === "admin" ? "Retirer admin" : "Rendre admin"}
                  </button>
                </span>
              )}
            </div>
          </div>
        ))}
        {!liste.length && <p className="text-sm text-muted">Aucun enseignant ne correspond.</p>}
      </div>
    </div>
  );
}

function Paiements({ d, action }: { d: Donnees; action: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-surface text-xs uppercase text-muted">
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Enseignant</th>
            <th className="px-3 py-2">Formule</th>
            <th className="px-3 py-2">Montant</th>
            <th className="px-3 py-2">Statut</th>
            <th className="px-3 py-2">Transaction</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {d.paiements.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap px-3 py-2">{formatDate(p.cree_le)}</td>
              <td className="px-3 py-2">{p.email}</td>
              <td className="px-3 py-2">{p.formule_id}</td>
              <td className="whitespace-nowrap px-3 py-2">{formatFcfa(p.montant_fcfa)}</td>
              <td className="px-3 py-2">
                <span className={p.statut === "reussi" ? "font-semibold text-faso" : p.statut === "en_attente" ? "text-muted" : "text-rouge"}>{STATUTS[p.statut] ?? p.statut}</span>
                {p.moyen && <span className="text-xs text-muted"> · {p.moyen}</span>}
                {p.statut === "en_attente" && (
                  <button type="button" onClick={() => void action({ action: "verifier_paiement", transaction: p.transaction_id }, "Paiement revérifié")} className="ml-2 text-xs text-faso underline">
                    Vérifier
                  </button>
                )}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{p.transaction_id}</td>
            </tr>
          ))}
          {!d.paiements.length && (
            <tr>
              <td colSpan={6} className="px-3 py-4 text-muted">
                Aucun paiement pour le moment.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const STATUTS_COM: Record<string, string> = { due: "À verser", versee: "Versée", annulee: "Annulée" };

function ParrainageAdmin({ d, action }: { d: Donnees; action: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [filtre, setFiltre] = useState<"due" | "tout">("due");
  const liste = d.commissions.filter((c) => filtre === "tout" || c.statut === "due");
  // Totaux à verser par parrain (un seul transfert mobile money par parrain).
  const parParrain = new Map<string, { telephone: string | null; total: number; ids: string[] }>();
  for (const c of d.commissions.filter((x) => x.statut === "due")) {
    const e = parParrain.get(c.parrain) ?? { telephone: c.telephone, total: 0, ids: [] };
    e.total += c.montant_fcfa;
    e.ids.push(c.id);
    parParrain.set(c.parrain, e);
  }
  async function verserTout(parrain: string, ids: string[]) {
    const reference = prompt(`Référence du transfert mobile money à ${parrain} (facultatif) :`) ?? undefined;
    for (const id of ids) await action({ action: "commission", id, statut: "versee", reference }, `Commissions de ${parrain} marquées versées`);
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        Chaque paiement réussi d&apos;un enseignant parrainé donne {d.commissions[0]?.taux ?? 20} % à son parrain, si celui-ci est abonné. Versez les montants par mobile money,
        puis marquez-les « versés ».
      </p>
      {parParrain.size > 0 && (
        <div className="rounded-xl border border-line bg-white p-3">
          <h2 className="font-bold text-faso-dark">À verser par parrain</h2>
          <ul className="mt-2 divide-y divide-line text-sm">
            {[...parParrain.entries()].map(([p, e]) => (
              <li key={p} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {p} · {e.telephone ?? "téléphone non renseigné"}
                </span>
                <span className="flex items-center gap-2">
                  <strong>{formatFcfa(e.total)}</strong>
                  <button type="button" onClick={() => void verserTout(p, e.ids)} className="rounded-lg bg-faso px-2 py-1 text-xs font-semibold text-white">
                    Marquer versé
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-2">
        <select value={filtre} onChange={(e) => setFiltre(e.target.value as typeof filtre)} className={input}>
          <option value="due">À verser</option>
          <option value="tout">Toutes les commissions</option>
        </select>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-muted">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Parrain</th>
              <th className="px-3 py-2">Filleul</th>
              <th className="px-3 py-2">Commission</th>
              <th className="px-3 py-2">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {liste.map((c) => (
              <tr key={c.id}>
                <td className="whitespace-nowrap px-3 py-2">{formatDate(c.cree_le)}</td>
                <td className="px-3 py-2">{c.parrain}</td>
                <td className="px-3 py-2">{c.filleul}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {formatFcfa(c.montant_fcfa)} <span className="text-xs text-muted">({c.taux} %)</span>
                </td>
                <td className="px-3 py-2">
                  {STATUTS_COM[c.statut]}
                  {c.reference_versement && <span className="text-xs text-muted"> · {c.reference_versement}</span>}
                  {c.statut === "due" && (
                    <button type="button" onClick={() => void action({ action: "commission", id: c.id, statut: "annulee" }, "Commission annulée")} className="ml-2 text-xs text-rouge underline">
                      Annuler
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!liste.length && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted">
                  Aucune commission pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Tarifs({ d, action }: { d: Donnees; action: (b: Record<string, unknown>, ok: string) => Promise<void> }) {
  const [edits, setEdits] = useState<Record<string, Formule>>(() => Object.fromEntries(d.formules.map((f) => [f.id, f])));
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Les nouveaux prix s&apos;appliquent aux prochains paiements. Montants en FCFA, multiples de 5.</p>
      {Object.values(edits).map((f) => (
        <div key={f.id} className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-white p-3">
          <label className="text-xs font-medium text-muted">
            Libellé
            <input value={f.libelle} onChange={(e) => setEdits({ ...edits, [f.id]: { ...f, libelle: e.target.value } })} className={`${input} mt-1 block w-56`} />
          </label>
          <label className="text-xs font-medium text-muted">
            Prix (FCFA)
            <input inputMode="numeric" value={f.prix_fcfa} onChange={(e) => setEdits({ ...edits, [f.id]: { ...f, prix_fcfa: Number(e.target.value.replace(/\D/g, "")) } })} className={`${input} mt-1 block w-28`} />
          </label>
          <label className="text-xs font-medium text-muted">
            Durée (jours)
            <input inputMode="numeric" value={f.duree_jours} onChange={(e) => setEdits({ ...edits, [f.id]: { ...f, duree_jours: Number(e.target.value.replace(/\D/g, "")) } })} className={`${input} mt-1 block w-24`} />
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input type="checkbox" className="accent-faso" checked={f.active} onChange={(e) => setEdits({ ...edits, [f.id]: { ...f, active: e.target.checked } })} /> Proposée
          </label>
          <button
            type="button"
            onClick={() => void action({ action: "formule", id: f.id, libelle: f.libelle, prix_fcfa: f.prix_fcfa, duree_jours: f.duree_jours, active: f.active }, `Formule « ${f.libelle} » enregistrée`)}
            className="rounded-lg bg-faso px-3 py-1.5 text-sm font-semibold text-white"
          >
            Enregistrer
          </button>
        </div>
      ))}
    </div>
  );
}
