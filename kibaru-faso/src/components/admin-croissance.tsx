"use client";

import { useState } from "react";
import { formatDate, formatFcfa } from "@/lib/abonnement";
import { lienDecouvrir, messagesCampagne } from "@/lib/campagne";

/** Onglets de croissance de l'espace admin : ambassadeurs (réseau de recommandation) et licences établissement. */

type Action = (b: Record<string, unknown>, ok: string) => Promise<void>;

export type StatsAmb = { inscrits: number; inscritsMois: number; payeurs: number; conversion: number; ventes: number; ventesMois: number; payeursMois: number };
export type Ambassadeur = {
  profil_id: string;
  email: string;
  nom: string | null;
  telephone: string | null;
  code_parrainage: string;
  region: string | null;
  zone: string | null;
  disciplines: string | null;
  taux: number | null;
  taux_effectif: number;
  objectif_mois: number | null;
  actif: boolean;
  note: string | null;
  acces_fin: string | null;
  stats: StatsAmb;
  commissionsDues: number;
  commissionsVersees: number;
};
export type Etablissement = {
  id: string;
  nom: string;
  ville: string | null;
  contact_nom: string | null;
  contact_telephone: string | null;
  contact_email: string | null;
  places: number;
  duree_jours: number;
  montant_fcfa: number;
  code: string;
  ambassadeur: string | null;
  actif: boolean;
  expire_le: string | null;
  note: string | null;
  cree_le: string;
  membres: { email: string; nom: string | null; cree_le: string }[];
};

const input = "rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";
const label = "text-xs font-medium text-muted";
const num = (v: string) => (v.replace(/\D/g, "") ? Number(v.replace(/\D/g, "")) : null);

function origine(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

async function copier(texte: string, quoi: string) {
  try {
    await navigator.clipboard.writeText(texte);
    alert(`${quoi} copié. Collez-le dans WhatsApp ou un SMS.`);
  } catch {
    prompt(`Copiez ${quoi.toLowerCase()} :`, texte);
  }
}

function Carte({ titre, valeur, detail }: { titre: string; valeur: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{titre}</div>
      <div className="mt-1 text-2xl font-extrabold text-faso-dark">{valeur}</div>
      {detail && <div className="text-xs text-muted">{detail}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Ambassadeurs

type FormAmb = {
  email: string;
  region: string;
  zone: string;
  disciplines: string;
  taux: string;
  objectif_mois: string;
  actif: boolean;
  note: string;
  offrir: boolean;
};
const AMB_VIDE: FormAmb = { email: "", region: "", zone: "", disciplines: "", taux: "", objectif_mois: "10", actif: true, note: "", offrir: true };

/** Kit de l'ambassadeur : ses messages de campagne, avec son lien personnel. */
function kitAmbassadeur(a: Ambassadeur): string {
  const lien = lienDecouvrir(a.code_parrainage, origine());
  const msgs = messagesCampagne(lien);
  return [
    `Bonjour ${a.nom ?? ""}, merci d'être ambassadeur PÉDAGOGUE.IA${a.region ? ` pour ${a.region}` : ""} !`,
    `Votre lien personnel : ${lien}`,
    `Vous touchez ${a.taux_effectif} % de chaque abonnement mensuel ou annuel des collègues inscrits par ce lien.`,
    "",
    "— Messages prêts à partager —",
    ...msgs.flatMap((m) => ["", `【${m.titre}】`, m.texte]),
  ].join("\n");
}

export function Ambassadeurs({ ambassadeurs, tauxParrainage, action }: { ambassadeurs: Ambassadeur[]; tauxParrainage: number; action: Action }) {
  const [f, setF] = useState<FormAmb>(AMB_VIDE);
  const [ouvert, setOuvert] = useState(false);
  const actifs = ambassadeurs.filter((a) => a.actif);
  const somme = (k: keyof StatsAmb) => actifs.reduce((s, a) => s + a.stats[k], 0);

  function modifier(a: Ambassadeur) {
    setF({
      email: a.email,
      region: a.region ?? "",
      zone: a.zone ?? "",
      disciplines: a.disciplines ?? "",
      taux: a.taux !== null ? String(Number(a.taux)) : "",
      objectif_mois: a.objectif_mois ? String(a.objectif_mois) : "",
      actif: a.actif,
      note: a.note ?? "",
      offrir: false,
    });
    setOuvert(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    await action(
      {
        action: "ambassadeur",
        email: f.email,
        region: f.region,
        zone: f.zone,
        disciplines: f.disciplines,
        taux: f.taux ? Number(f.taux.replace(",", ".")) : null,
        objectif_mois: num(f.objectif_mois),
        actif: f.actif,
        note: f.note,
        ...(f.offrir ? { offrir_acces_jours: 365 } : {}),
      },
      `Ambassadeur ${f.email} enregistré`,
    );
    setF(AMB_VIDE);
    setOuvert(false);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border-2 border-or/60 bg-or-50 p-4 text-sm">
        <h2 className="font-bold text-ink">🌍 Le réseau des ambassadeurs</h2>
        <p className="mt-1">
          Un ambassadeur est un enseignant influent (un par région, par CEB ou par discipline) qui fait connaître PÉDAGOGUE.IA à ses collègues : groupes WhatsApp, animations
          pédagogiques, conseils d&apos;enseignants. Ses filleuls sont suivis ici. Il touche sa commission ({tauxParrainage} % par défaut, ou un taux propre) même sans
          abonnement personnel. Offrez-lui l&apos;accès annuel : c&apos;est son meilleur argument.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Carte titre="Ambassadeurs actifs" valeur={String(actifs.length)} detail={`${ambassadeurs.length - actifs.length} en pause`} />
        <Carte titre="Inscrits ce mois" valeur={String(somme("inscritsMois"))} detail={`${somme("inscrits")} au total`} />
        <Carte titre="Ventes du mois" valeur={formatFcfa(somme("ventesMois"))} detail={`${formatFcfa(somme("ventes"))} au total`} />
        <Carte titre="Commissions à verser" valeur={formatFcfa(actifs.reduce((s, a) => s + a.commissionsDues, 0))} detail="onglet Parrainage pour verser" />
      </div>

      {!ouvert ? (
        <button type="button" onClick={() => setOuvert(true)} className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white">
          + Nommer un ambassadeur
        </button>
      ) : (
        <form onSubmit={enregistrer} className="space-y-3 rounded-xl border-2 border-faso/30 bg-white p-4">
          <h2 className="font-bold text-faso-dark">{ambassadeurs.some((a) => a.email === f.email) ? "Modifier l'ambassadeur" : "Nommer un ambassadeur"}</h2>
          <p className="text-xs text-muted">L&apos;enseignant doit d&apos;abord avoir créé son compte sur PÉDAGOGUE.IA, avec cette adresse e-mail.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className={label}>
              E-mail de son compte *
              <input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="enseignant@exemple.com" />
            </label>
            <label className={label}>
              Région
              <input value={f.region} onChange={(e) => setF({ ...f, region: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="Centre, Hauts-Bassins…" />
            </label>
            <label className={label}>
              Zone d&apos;action (ville, CEB, établissement)
              <input value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="Ouagadougou, CEB de Baskuy" />
            </label>
            <label className={label}>
              Disciplines ou cycle
              <input value={f.disciplines} onChange={(e) => setF({ ...f, disciplines: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="Maths, PC · post-primaire" />
            </label>
            <label className={label}>
              Commission (%)
              <input inputMode="decimal" value={f.taux} onChange={(e) => setF({ ...f, taux: e.target.value.replace(/[^\d.,]/g, "") })} className={`${input} mt-1 block w-full`} placeholder={`${tauxParrainage} (taux général)`} />
            </label>
            <label className={label}>
              Objectif d&apos;inscriptions par mois
              <input inputMode="numeric" value={f.objectif_mois} onChange={(e) => setF({ ...f, objectif_mois: e.target.value.replace(/\D/g, "") })} className={`${input} mt-1 block w-full`} placeholder="10" />
            </label>
            <label className={`${label} sm:col-span-2`}>
              Note interne
              <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="Conseiller pédagogique, très actif sur WhatsApp…" />
            </label>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-faso" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /> Actif
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-faso" checked={f.offrir} onChange={(e) => setF({ ...f, offrir: e.target.checked })} /> Lui offrir 1 an d&apos;accès maintenant
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white">
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => {
                setF(AMB_VIDE);
                setOuvert(false);
              }}
              className="rounded-lg border border-line px-4 py-2 text-sm"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {ambassadeurs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted">
          Aucun ambassadeur pour le moment. Commencez par 5 à 10 enseignants influents, répartis dans les grandes régions.
        </p>
      ) : (
        <ol className="space-y-3">
          {ambassadeurs.map((a, i) => {
            const obj = a.objectif_mois ?? 0;
            const pct = obj ? Math.min(100, Math.round((a.stats.inscritsMois / obj) * 100)) : 0;
            return (
              <li key={a.profil_id} className={`rounded-xl border bg-white p-4 ${a.actif ? "border-line" : "border-dashed border-line opacity-70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${a.actif && i < 3 ? "bg-or text-ink" : "bg-surface text-muted"}`}>
                        {a.actif ? i + 1 : "–"}
                      </span>
                      <strong className="truncate">{a.nom || a.email}</strong>
                      {!a.actif && <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-muted">en pause</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {[a.email, a.telephone, a.region, a.zone, a.disciplines].filter(Boolean).join(" · ")}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      Code {a.code_parrainage} · commission {a.taux_effectif} %{a.acces_fin ? ` · accès jusqu'au ${formatDate(a.acces_fin)}` : " · pas d'accès en cours"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copier(kitAmbassadeur(a), "Le kit de l'ambassadeur")} className="rounded-lg bg-faso px-3 py-1.5 text-xs font-semibold text-white">
                      Copier son kit WhatsApp
                    </button>
                    <button type="button" onClick={() => modifier(a)} className="rounded-lg border border-line px-3 py-1.5 text-xs">
                      Modifier
                    </button>
                    <button
                      type="button"
                      onClick={() => confirm(`Retirer ${a.email} des ambassadeurs ? Ses filleuls restent rattachés à lui comme parrain.`) && void action({ action: "ambassadeur_retirer", utilisateur: a.profil_id }, "Ambassadeur retiré")}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-rouge"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm sm:grid-cols-5">
                  <div className="rounded-lg bg-surface p-2">
                    <div className="font-extrabold text-faso-dark">{a.stats.inscritsMois}</div>
                    <div className="text-[11px] text-muted">inscrits ce mois ({a.stats.inscrits} au total)</div>
                  </div>
                  <div className="rounded-lg bg-surface p-2">
                    <div className="font-extrabold text-faso-dark">{a.stats.payeurs}</div>
                    <div className="text-[11px] text-muted">abonnés ({a.stats.conversion} % des inscrits)</div>
                  </div>
                  <div className="rounded-lg bg-surface p-2">
                    <div className="font-extrabold text-faso-dark">{formatFcfa(a.stats.ventesMois)}</div>
                    <div className="text-[11px] text-muted">ventes du mois</div>
                  </div>
                  <div className="rounded-lg bg-surface p-2">
                    <div className="font-extrabold text-faso-dark">{formatFcfa(a.stats.ventes)}</div>
                    <div className="text-[11px] text-muted">ventes au total</div>
                  </div>
                  <div className="rounded-lg bg-surface p-2">
                    <div className="font-extrabold text-rouge">{formatFcfa(a.commissionsDues)}</div>
                    <div className="text-[11px] text-muted">à lui verser ({formatFcfa(a.commissionsVersees)} versés)</div>
                  </div>
                </div>
                {obj > 0 && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs">
                      <span>Objectif du mois : {obj} inscriptions</span>
                      <strong>{pct} %</strong>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-faso-50">
                      <div className={`h-full rounded-full ${pct >= 100 ? "bg-or" : "bg-faso"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}
                {a.note && <p className="mt-2 text-xs text-muted">📝 {a.note}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Licences établissement

type FormEtab = {
  id?: string;
  nom: string;
  ville: string;
  contact_nom: string;
  contact_telephone: string;
  contact_email: string;
  places: string;
  duree_jours: string;
  montant_fcfa: string;
  ambassadeur_email: string;
  actif: boolean;
  expire_le: string;
  note: string;
};
const ETAB_VIDE: FormEtab = {
  nom: "",
  ville: "",
  contact_nom: "",
  contact_telephone: "",
  contact_email: "",
  places: "10",
  duree_jours: "365",
  montant_fcfa: "250000",
  ambassadeur_email: "",
  actif: true,
  expire_le: "",
  note: "",
};

/** Message à transmettre au directeur : lien et code d'activation pour ses enseignants. */
function messageDirecteur(e: Etablissement): string {
  const lien = `${origine()}/?licence=${e.code}`;
  return [
    `PÉDAGOGUE.IA — licence ${e.nom} (${e.places} enseignants)`,
    "",
    "Chaque enseignant de l'établissement :",
    `1. ouvre ce lien et crée son compte (ou se connecte) : ${lien}`,
    `2. dans « Mon compte », rubrique « Licence établissement », saisit le code ${e.code} (déjà rempli s'il est passé par le lien) ;`,
    "3. son accès complet est activé immédiatement.",
    "",
    `Places : ${e.places}. Validité de chaque accès : ${e.duree_jours === 365 ? "1 an" : `${e.duree_jours} jours`} à partir de l'activation.`,
  ].join("\n");
}

export function Etablissements({ etablissements, action }: { etablissements: Etablissement[]; action: Action }) {
  const [f, setF] = useState<FormEtab>(ETAB_VIDE);
  const [ouvert, setOuvert] = useState(false);
  const places = etablissements.filter((e) => e.actif).reduce((s, e) => s + e.places, 0);
  const utilisees = etablissements.filter((e) => e.actif).reduce((s, e) => s + e.membres.length, 0);

  function modifier(e: Etablissement) {
    setF({
      id: e.id,
      nom: e.nom,
      ville: e.ville ?? "",
      contact_nom: e.contact_nom ?? "",
      contact_telephone: e.contact_telephone ?? "",
      contact_email: e.contact_email ?? "",
      places: String(e.places),
      duree_jours: String(e.duree_jours),
      montant_fcfa: String(e.montant_fcfa),
      ambassadeur_email: e.ambassadeur && e.ambassadeur !== "—" ? e.ambassadeur : "",
      actif: e.actif,
      expire_le: e.expire_le ? e.expire_le.slice(0, 10) : "",
      note: e.note ?? "",
    });
    setOuvert(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enregistrer(ev: React.FormEvent) {
    ev.preventDefault();
    await action(
      {
        action: "etablissement",
        ...(f.id ? { id: f.id } : {}),
        nom: f.nom,
        ville: f.ville,
        contact_nom: f.contact_nom,
        contact_telephone: f.contact_telephone,
        contact_email: f.contact_email,
        places: num(f.places) ?? 1,
        duree_jours: num(f.duree_jours) ?? 365,
        montant_fcfa: num(f.montant_fcfa) ?? 0,
        ambassadeur_email: f.ambassadeur_email || undefined,
        actif: f.actif,
        expire_le: f.expire_le || null,
        note: f.note,
      },
      f.id ? `Licence « ${f.nom} » mise à jour` : `Licence « ${f.nom} » créée`,
    );
    setF(ETAB_VIDE);
    setOuvert(false);
  }

  const parPlace = num(f.places) && num(f.montant_fcfa) ? Math.round(num(f.montant_fcfa)! / num(f.places)!) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-white p-4 text-sm">
        <h2 className="font-bold text-faso-dark">🏫 Licences établissement</h2>
        <p className="mt-1 text-muted">
          Une école ou un lycée paie pour plusieurs enseignants en une fois (virement, mobile money ou espèces, contre reçu). Créez la licence, puis envoyez le message au
          directeur : chaque enseignant active sa place avec le code. Prix conseillé : <strong>25 000 FCFA par enseignant et par an</strong> à partir de 10 places, soit
          250 000 FCFA pour 10 enseignants. Chaque place donne l&apos;accès annuel (400 générations).
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Carte titre="Établissements" valeur={String(etablissements.filter((e) => e.actif).length)} />
        <Carte titre="Places vendues" valeur={String(places)} detail={`${utilisees} activées`} />
        <Carte titre="Chiffre d'affaires" valeur={formatFcfa(etablissements.reduce((s, e) => s + e.montant_fcfa, 0))} />
        <Carte titre="Places libres" valeur={String(places - utilisees)} detail="à relancer auprès des directeurs" />
      </div>

      {!ouvert ? (
        <button type="button" onClick={() => setOuvert(true)} className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white">
          + Nouvelle licence établissement
        </button>
      ) : (
        <form onSubmit={enregistrer} className="space-y-3 rounded-xl border-2 border-faso/30 bg-white p-4">
          <h2 className="font-bold text-faso-dark">{f.id ? "Modifier la licence" : "Nouvelle licence"}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className={`${label} sm:col-span-2`}>
              Établissement *
              <input required value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="Lycée privé Les Lauréats" />
            </label>
            <label className={label}>
              Ville
              <input value={f.ville} onChange={(e) => setF({ ...f, ville: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="Ouagadougou" />
            </label>
            <label className={label}>
              Contact (directeur, censeur…)
              <input value={f.contact_nom} onChange={(e) => setF({ ...f, contact_nom: e.target.value })} className={`${input} mt-1 block w-full`} />
            </label>
            <label className={label}>
              Téléphone du contact
              <input value={f.contact_telephone} onChange={(e) => setF({ ...f, contact_telephone: e.target.value })} className={`${input} mt-1 block w-full`} />
            </label>
            <label className={label}>
              E-mail du contact
              <input value={f.contact_email} onChange={(e) => setF({ ...f, contact_email: e.target.value })} className={`${input} mt-1 block w-full`} />
            </label>
            <label className={label}>
              Nombre de places *
              <input required inputMode="numeric" value={f.places} onChange={(e) => setF({ ...f, places: e.target.value.replace(/\D/g, "") })} className={`${input} mt-1 block w-full`} />
            </label>
            <label className={label}>
              Montant payé (FCFA)
              <input inputMode="numeric" value={f.montant_fcfa} onChange={(e) => setF({ ...f, montant_fcfa: e.target.value.replace(/\D/g, "") })} className={`${input} mt-1 block w-full`} />
              {parPlace !== null && <span className="mt-0.5 block text-[11px]">soit {formatFcfa(parPlace)} par enseignant</span>}
            </label>
            <label className={label}>
              Durée de chaque accès (jours)
              <input inputMode="numeric" value={f.duree_jours} onChange={(e) => setF({ ...f, duree_jours: e.target.value.replace(/\D/g, "") })} className={`${input} mt-1 block w-full`} />
            </label>
            <label className={label}>
              Apporté par l&apos;ambassadeur (e-mail)
              <input value={f.ambassadeur_email} onChange={(e) => setF({ ...f, ambassadeur_email: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="facultatif" />
            </label>
            <label className={label}>
              Codes utilisables jusqu&apos;au
              <input type="date" value={f.expire_le} onChange={(e) => setF({ ...f, expire_le: e.target.value })} className={`${input} mt-1 block w-full`} />
            </label>
            <label className={label}>
              Note
              <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={`${input} mt-1 block w-full`} placeholder="Reçu n°…, payé par Orange Money" />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-faso" checked={f.actif} onChange={(e) => setF({ ...f, actif: e.target.checked })} /> Licence active (le code peut être utilisé)
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white">
              {f.id ? "Enregistrer" : "Créer la licence"}
            </button>
            <button
              type="button"
              onClick={() => {
                setF(ETAB_VIDE);
                setOuvert(false);
              }}
              className="rounded-lg border border-line px-4 py-2 text-sm"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {etablissements.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted">
          Aucune licence pour le moment. Cible prioritaire : les écoles et lycées privés et confessionnels, qui décident vite et paient pour toute l&apos;équipe.
        </p>
      ) : (
        <ul className="space-y-3">
          {etablissements.map((e) => {
            const pct = Math.round((e.membres.length / e.places) * 100);
            return (
              <li key={e.id} className={`rounded-xl border bg-white p-4 ${e.actif ? "border-line" : "border-dashed border-line opacity-70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong>{e.nom}</strong>
                    {!e.actif && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-xs text-muted">désactivée</span>}
                    <div className="text-xs text-muted">
                      {[e.ville, e.contact_nom, e.contact_telephone, e.contact_email].filter(Boolean).join(" · ") || "—"}
                    </div>
                    <div className="mt-1 text-xs">
                      Code <code className="rounded bg-faso-50 px-1.5 py-0.5 font-bold text-faso-dark">{e.code}</code> · {formatFcfa(e.montant_fcfa)} · créée le {formatDate(e.cree_le)}
                      {e.expire_le ? ` · code valable jusqu'au ${formatDate(e.expire_le)}` : ""}
                      {e.ambassadeur ? ` · apportée par ${e.ambassadeur}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copier(messageDirecteur(e), "Le message pour le directeur")} className="rounded-lg bg-faso px-3 py-1.5 text-xs font-semibold text-white">
                      Copier le message pour le directeur
                    </button>
                    <button type="button" onClick={() => modifier(e)} className="rounded-lg border border-line px-3 py-1.5 text-xs">
                      Modifier
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs">
                    <span>Places activées</span>
                    <strong>
                      {e.membres.length} / {e.places}
                    </strong>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-faso-50">
                    <div className="h-full rounded-full bg-faso" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {e.membres.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted">Enseignants ({e.membres.length})</summary>
                    <ul className="mt-1 space-y-0.5">
                      {e.membres.map((m) => (
                        <li key={m.email}>
                          {m.nom || m.email} <span className="text-muted">· {m.email} · le {formatDate(m.cree_le)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
                {e.note && <p className="mt-2 text-xs text-muted">📝 {e.note}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
