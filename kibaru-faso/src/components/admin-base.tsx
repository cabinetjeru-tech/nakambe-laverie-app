"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { casesCouvertes, CLASSES_COUVERTURE, MATIERES_COUVERTURE, type Couverture } from "@/lib/base/couverture";
import { prochainId } from "@/lib/base/en-ligne";
import { CLASS_INFO, DOC_TYPES, STATUT_LABELS, SUBJECTS, type Statut } from "@/lib/base/structure";
import { hoteOfficiel } from "@/lib/base/sources-officielles";
import { extraireDansNavigateur, nettoyerTexte } from "@/lib/extraction-navigateur";

/** Onglet « Base documentaire » de l'espace admin : dépôt des programmes, guides et référentiels officiels. */

type DocEnLigne = {
  id: string;
  titre: string;
  type: string;
  classes: string[];
  disciplines: string[];
  organisme: string | null;
  annee: string | null;
  version: string | null;
  statut: Statut;
  source: string | null;
  url: string | null;
  niveau_source: number | null;
  avertissement: string | null;
  observations: string | null;
  fichier_nom: string | null;
  maj_le: string;
  caracteres: number;
  extrait: string;
};
type EnAttente = {
  documentId: string | null;
  titre: string;
  type: string | null;
  classes: string[];
  disciplines: string[];
  organisme: string | null;
  annee: string | null;
  version: string | null;
  source: string | null;
  url: string | null;
  niveauSource: number | null;
  priorite: string | null;
};
type Donnees = { documents: DocEnLigne[]; enAttente: EnAttente[]; couverture?: Couverture; fichiers: { documentId: string | null; titre: string; statut: string | null }[] };

type Formulaire = {
  id: string;
  titre: string;
  type: string;
  classes: string[];
  matiere: string;
  organisme: string;
  annee: string;
  version: string;
  statut: Statut;
  source: string;
  url: string;
  niveau_source: number | null;
  avertissement: string;
};

const VIDE: Formulaire = {
  id: "",
  titre: "",
  type: "PROGRAMME",
  classes: [],
  matiere: "",
  organisme: "",
  annee: "",
  version: "",
  statut: "A_VERIFIER",
  source: "",
  url: "",
  niveau_source: 2,
  avertissement: "",
};

const STATUT_AIDE: Record<Statut, string> = {
  ACTIF: "texte officiel en vigueur, vérifié : cité comme référence",
  PROVISOIRE: "en vigueur mais susceptible d'évoluer",
  A_VERIFIER: "consulté, mais présenté comme non confirmé",
  REMPLACE: "remplacé par une version plus récente : non consulté",
  ARCHIVE: "conservé pour mémoire : non consulté",
};
const NIVEAUX_SOURCE: [number, string][] = [
  [1, "1 — Source officielle (ministère, texte réglementaire)"],
  [2, "2 — Document curriculaire officiel (programme, guide validé)"],
  [3, "3 — Ressource institutionnelle complémentaire"],
  [4, "4 — Ressource pédagogique fiable non officielle"],
];
const input = "w-full rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";
const statutCls = (s: string) =>
  s === "ACTIF" ? "bg-faso-50 text-faso-dark" : s === "PROVISOIRE" || s === "A_VERIFIER" ? "bg-or-50 text-[#7a5a00]" : "bg-surface text-muted";

export function BaseDocumentaire() {
  const [d, setD] = useState<Donnees | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [f, setF] = useState<Formulaire>(VIDE);
  const [texte, setTexte] = useState("");
  const [fichierNom, setFichierNom] = useState<string | null>(null);
  const [infoExtraction, setInfoExtraction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imports, setImports] = useState<Record<string, string>>({});
  const [importEnCours, setImportEnCours] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const charger = useCallback(async () => {
    const r = await fetch("/api/admin/base");
    const j = (await r.json().catch(() => ({}))) as Donnees & { error?: string };
    if (!r.ok) setMessage(`Erreur : ${j.error ?? "chargement impossible"}`);
    else setD(j);
  }, []);
  useEffect(() => void charger(), [charger]);

  const idsPris = d ? [...d.documents.map((x) => x.id), ...d.enAttente.map((x) => x.documentId ?? ""), ...d.fichiers.map((x) => x.documentId ?? "")] : [];
  const proposerId = (classes: string[], matiere: string) => prochainId(classes[0], matiere, idsPris);

  async function choisirFichier(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setInfoExtraction("Lecture du document…");
    try {
      const r = await extraireDansNavigateur(file);
      const t = nettoyerTexte(r.texte);
      setTexte(t);
      setFichierNom(file.name);
      const scan = r.pages && r.pagesVides !== undefined && r.pagesVides > r.pages / 2;
      setInfoExtraction(
        t.length < 200
          ? "⚠️ Presque aucun texte lu : ce document est sans doute scanné (image). Il faut une version PDF avec du texte (ou un Word)."
          : `${t.length.toLocaleString("fr-FR")} caractères lus${r.pages ? ` sur ${r.pages} page${r.pages > 1 ? "s" : ""}` : ""}.${scan ? " ⚠️ Beaucoup de pages sans texte (pages scannées ?) : vérifiez l'aperçu." : ""}`,
      );
      setF((x) => ({ ...x, titre: x.titre || file.name.replace(/\.(pdf|docx|txt|md)$/i, "").replace(/[_-]+/g, " ") }));
    } catch (e) {
      setInfoExtraction(`⚠️ ${(e as Error).message}`);
      setTexte("");
    } finally {
      setBusy(false);
    }
  }

  function deposerPour(p: EnAttente) {
    setF({
      ...VIDE,
      id: p.documentId ?? "",
      titre: p.titre,
      type: p.type && p.type in DOC_TYPES ? p.type : "GUIDE_PEDAGOGIQUE",
      classes: p.classes.filter((c) => CLASS_INFO.some((x) => x.classe === c)),
      matiere: p.disciplines[0] ?? "",
      organisme: p.organisme ?? "",
      annee: p.annee && !/v[ée]rifier/i.test(p.annee) ? p.annee : "",
      version: p.version && !/v[ée]rifier/i.test(p.version) ? p.version : "",
      source: p.source ?? "",
      url: p.url ?? "",
      niveau_source: p.niveauSource ?? 2,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function envoyer(corps: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMessage(null);
    const r = await fetch("/api/admin/base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string; message?: string };
    setBusy(false);
    if (!r?.ok) {
      setMessage(`Erreur : ${j?.error ?? "réseau indisponible"}`);
      return false;
    }
    setMessage(j?.message ?? ok);
    await charger();
    return true;
  }

  async function deposer(e: React.FormEvent) {
    e.preventDefault();
    if (texte.length < 200) return setMessage("Choisissez d'abord un document lisible (PDF avec texte, Word ou texte).");
    if (!f.classes.length && !confirm("Aucune classe cochée : le document s'appliquera à toutes les classes. Continuer ?")) return;
    const id = (f.id || proposerId(f.classes, f.matiere)).toUpperCase();
    const fait = await envoyer(
      {
        action: "deposer",
        id,
        titre: f.titre,
        type: f.type,
        classes: f.classes,
        disciplines: f.matiere ? [f.matiere] : [],
        organisme: f.organisme,
        annee: f.annee,
        version: f.version,
        statut: f.statut,
        source: f.source,
        url: f.url,
        niveau_source: f.niveau_source,
        avertissement: f.avertissement,
        fichier_nom: fichierNom ?? undefined,
        texte,
      },
      `Document ${id} ajouté à la base : PÉDAGOGUE.IA le consulte dès maintenant.`,
    );
    if (fait) {
      setF(VIDE);
      setTexte("");
      setFichierNom(null);
      setInfoExtraction(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const changerStatut = (doc: DocEnLigne, statut: Statut) =>
    envoyer(
      {
        action: "modifier",
        id: doc.id,
        titre: doc.titre,
        type: doc.type,
        classes: doc.classes,
        disciplines: doc.disciplines,
        organisme: doc.organisme ?? "",
        annee: doc.annee ?? "",
        version: doc.version ?? "",
        statut,
        source: doc.source ?? "",
        url: doc.url ?? "",
        niveau_source: doc.niveau_source,
        avertissement: doc.avertissement ?? "",
        observations: doc.observations ?? "",
      },
      `Statut de ${doc.id} : ${STATUT_LABELS[statut]}.`,
    );

  /** Import automatique par le serveur depuis le lien officiel (un document par requête). */
  async function importer(id: string): Promise<boolean> {
    setImportEnCours(id);
    setImports((x) => ({ ...x, [id]: "⏳ téléchargement et lecture…" }));
    const r = await fetch("/api/admin/base", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "importer", id }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string; message?: string };
    const ok = !!r?.ok;
    setImports((x) => ({ ...x, [id]: ok ? `✅ ${j.message ?? "importé"}` : `❌ ${j.error ?? "réseau indisponible"}` }));
    setImportEnCours(null);
    return ok;
  }

  async function importerTout(ids: string[]) {
    setMessage(null);
    let reussis = 0;
    for (const id of ids) if (await importer(id)) reussis++;
    await charger();
    setMessage(`Import terminé : ${reussis} document(s) importé(s) sur ${ids.length}. Les échecs sont détaillés dans la liste ; pour ceux-là, téléchargez puis déposez à la main.`);
  }

  if (!d) return <p className="text-sm text-muted">{message ?? "Chargement de la base documentaire…"}</p>;
  const importables = d.enAttente.filter((p) => p.url && p.documentId).map((p) => p.documentId!);
  const idsRegistre = new Set(importables.map((x) => x.toUpperCase()));
  const actifs = d.documents.filter((x) => x.statut === "ACTIF").length;
  const aVerifier = d.documents.filter((x) => x.statut === "A_VERIFIER").length;

  return (
    <div className="space-y-4">
      {message && <p className="rounded-lg border border-faso/30 bg-faso-50 p-3 text-sm">{message}</p>}

      <section className="rounded-xl border border-line bg-white p-4 text-sm">
        <h2 className="font-bold text-faso-dark">Base documentaire officielle</h2>
        <p className="mt-1 text-muted">
          Déposez ici les programmes, guides pédagogiques, référentiels et textes officiels. PÉDAGOGUE.IA les consulte pour chaque préparation et les cite
          (étiquette « SOURCE PÉDAGOGUE.IA » et renvoi [R1]) au lieu de simples propositions. Seuls les documents au statut <strong>ACTIF</strong> sont présentés
          comme la référence officielle en vigueur.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-surface p-2">
            <div className="text-xl font-extrabold text-faso-dark">{d.documents.length + d.fichiers.length}</div>
            <div className="text-xs text-muted">documents consultables</div>
          </div>
          <div className="rounded-lg bg-surface p-2">
            <div className="text-xl font-extrabold text-faso-dark">{actifs}</div>
            <div className="text-xs text-muted">au statut ACTIF</div>
          </div>
          <div className="rounded-lg bg-surface p-2">
            <div className="text-xl font-extrabold text-rouge">{d.enAttente.length}</div>
            <div className="text-xs text-muted">du registre à déposer</div>
          </div>
        </div>
        {aVerifier > 0 && (
          <div className="mt-3 rounded-lg border border-or/40 bg-or-50 p-3 text-xs">
            <p>
              <strong>{aVerifier} document(s) « À vérifier ».</strong> Ils sont consultés, mais l'assistant les présente comme non confirmés. Une fois relus
              (bon document, bonne classe, texte lisible), passez-les en « Provisoire » : l'assistant les citera comme documents en vigueur susceptibles
              d'évoluer.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                confirm(`Passer les ${aVerifier} documents « À vérifier » au statut « Provisoire » ?`) &&
                void envoyer({ action: "statut_groupe", de: "A_VERIFIER", vers: "PROVISOIRE" }, "Statuts mis à jour.")
              }
              className="mt-2 rounded-lg bg-faso px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              Tout passer en « Provisoire »
            </button>
          </div>
        )}
      </section>

      {d.couverture && <TableauCouverture c={d.couverture} />}

      <form ref={formRef} onSubmit={deposer} className="space-y-3 rounded-xl border-2 border-faso/30 bg-white p-4 text-sm">
        <h2 className="font-bold text-faso-dark">Déposer un document</h2>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md"
            onChange={(e) => void choisirFichier(e.target.files?.[0])}
            aria-label="Document à déposer"
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-faso file:px-3 file:py-2 file:font-semibold file:text-white"
          />
          <p className="mt-1 text-xs text-muted">PDF contenant du texte, Word (.docx) ou texte. Le texte est lu sur cet ordinateur ; le fichier n&apos;est pas envoyé, seul son texte l&apos;est.</p>
          {infoExtraction && <p className={`mt-1 text-xs ${infoExtraction.startsWith("⚠️") ? "text-rouge" : "text-faso-dark"}`}>{infoExtraction}</p>}
          {texte && (
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer text-muted">Aperçu du texte lu</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-surface p-2 font-sans">{texte.slice(0, 2500)}</pre>
            </details>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-medium text-muted sm:col-span-2">
            Titre officiel
            <input required value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} placeholder="Programme de mathématiques — classe de 6e" className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-medium text-muted">
            Type de document
            <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className={`${input} mt-1`}>
              {Object.entries(DOC_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Matière
            <input
              list="matieres-base"
              value={f.matiere}
              onChange={(e) => setF({ ...f, matiere: e.target.value })}
              placeholder="Mathématiques (vide = toutes)"
              className={`${input} mt-1`}
            />
            <datalist id="matieres-base">
              {SUBJECTS.map((s) => (
                <option key={s.code} value={s.label} />
              ))}
            </datalist>
          </label>
          <fieldset className="text-xs font-medium text-muted sm:col-span-2">
            <legend>Classes concernées (aucune = toutes)</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CLASS_INFO.map((c) => {
                const on = f.classes.includes(c.classe);
                return (
                  <button
                    key={c.classe}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setF({ ...f, classes: on ? f.classes.filter((x) => x !== c.classe) : [...f.classes, c.classe] })}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? "border-faso bg-faso text-white" : "border-line text-ink"}`}
                  >
                    {c.classe}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <label className="text-xs font-medium text-muted">
            Statut
            <select value={f.statut} onChange={(e) => setF({ ...f, statut: e.target.value as Statut })} className={`${input} mt-1`}>
              {(Object.keys(STATUT_AIDE) as Statut[]).map((s) => (
                <option key={s} value={s}>
                  {STATUT_LABELS[s]} — {STATUT_AIDE[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Niveau de source
            <select value={f.niveau_source ?? ""} onChange={(e) => setF({ ...f, niveau_source: e.target.value ? Number(e.target.value) : null })} className={`${input} mt-1`}>
              {NIVEAUX_SOURCE.map(([n, l]) => (
                <option key={n} value={n}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Organisme émetteur
            <input value={f.organisme} onChange={(e) => setF({ ...f, organisme: e.target.value })} placeholder="Ministère…, DGRIEF…" className={`${input} mt-1`} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-medium text-muted">
              Année
              <input value={f.annee} onChange={(e) => setF({ ...f, annee: e.target.value })} placeholder="2024" className={`${input} mt-1`} />
            </label>
            <label className="text-xs font-medium text-muted">
              Version
              <input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="1" className={`${input} mt-1`} />
            </label>
          </div>
          <label className="text-xs font-medium text-muted">
            Source (où le document a été obtenu)
            <input value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} placeholder="Site du ministère, DRENA du Centre…" className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-medium text-muted">
            Lien (collez le lien du PDF officiel pour l&apos;importer sans le télécharger)
            <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value.trim() })} placeholder="https://fasoeducation.bf/… ou https://www.education.gov.bf/…" className={`${input} mt-1`} />
          </label>
          <label className="text-xs font-medium text-muted sm:col-span-2">
            Consigne d&apos;usage pour l&apos;IA (facultatif)
            <input
              value={f.avertissement}
              onChange={(e) => setF({ ...f, avertissement: e.target.value })}
              placeholder="Ex. : n'utiliser que pour la progression, pas pour les contenus"
              className={`${input} mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-muted">
            Identifiant
            <input
              value={f.id}
              onChange={(e) => setF({ ...f, id: e.target.value.toUpperCase() })}
              placeholder={proposerId(f.classes, f.matiere)}
              className={`${input} mt-1 font-mono`}
            />
          </label>
        </div>
        {texte.length < 200 && hoteOfficiel(f.url) && !(f.id && idsRegistre.has(f.id.toUpperCase())) ? (
          <div className="rounded-lg bg-faso-50 p-3">
            <p className="text-xs text-faso-dark">Lien officiel reconnu : le serveur peut télécharger et lire ce document lui-même (inutile de choisir un fichier).</p>
            <button
              type="button"
              disabled={busy || !f.titre.trim()}
              onClick={async () => {
                const id = (f.id || proposerId(f.classes, f.matiere)).toUpperCase();
                setBusy(true);
                setMessage(null);
                const r = await fetch("/api/admin/base", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "importer_lien",
                    id,
                    titre: f.titre,
                    type: f.type,
                    classes: f.classes,
                    disciplines: f.matiere ? [f.matiere] : [],
                    organisme: f.organisme,
                    annee: f.annee,
                    version: f.version,
                    statut: f.statut,
                    source: f.source,
                    url: f.url,
                    niveau_source: f.niveau_source,
                    avertissement: f.avertissement,
                  }),
                }).catch(() => null);
                const j = (await r?.json().catch(() => ({}))) as { error?: string; message?: string };
                setBusy(false);
                if (r?.ok) {
                  setMessage(`${j.message ?? `${id} importé`} PÉDAGOGUE.IA le consulte dès maintenant.`);
                  setF(VIDE);
                  await charger();
                } else setMessage(`Erreur : ${j?.error ?? "réseau indisponible"}`);
              }}
              className="mt-2 rounded-lg bg-faso px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Téléchargement et lecture en cours…" : "Importer depuis ce lien"}
            </button>
            {!f.titre.trim() && <p className="mt-1 text-xs text-muted">Indiquez d&apos;abord le titre du document.</p>}
          </div>
        ) : texte.length < 200 && f.url && f.id && idsRegistre.has(f.id.toUpperCase()) ? (
          <div className="rounded-lg bg-faso-50 p-3">
            <p className="text-xs text-faso-dark">Pas besoin de fichier : ce document a un lien officiel connu. Le serveur peut le télécharger et le lire lui-même.</p>
            <button
              type="button"
              disabled={!!importEnCours}
              onClick={async () => {
                const ok = await importer(f.id.toUpperCase());
                await charger();
                setMessage(ok ? `${f.id} importé : PÉDAGOGUE.IA le consulte dès maintenant (statut À VÉRIFIER).` : `Import de ${f.id} impossible : la raison est indiquée sous le bouton. Vous pouvez aussi télécharger le document puis le choisir en haut du formulaire.`);
                if (ok) setF(VIDE);
              }}
              className="mt-2 rounded-lg bg-faso px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {importEnCours ? "Téléchargement et lecture en cours…" : "Importer depuis le lien officiel"}
            </button>
            {f.id && imports[f.id.toUpperCase()] && <p className="mt-1 text-xs">{imports[f.id.toUpperCase()]}</p>}
          </div>
        ) : (
          <div>
            <button type="submit" disabled={busy || texte.length < 200} className="rounded-lg bg-faso px-4 py-2 font-semibold text-white disabled:opacity-40">
              {busy ? "Patientez…" : "Ajouter à la base documentaire"}
            </button>
            {texte.length < 200 && <p className="mt-1 text-xs text-muted">Choisissez d&apos;abord le fichier (tout en haut du formulaire) : le bouton s&apos;active une fois son texte lu.</p>}
          </div>
        )}
      </form>

      {d.enAttente.length > 0 && (
        <section className="rounded-xl border border-line bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-faso-dark">Ressources du registre à déposer ({d.enAttente.length})</h2>
            {importables.length > 0 && (
              <button
                type="button"
                disabled={!!importEnCours}
                onClick={() => void importerTout(importables)}
                className="rounded-lg bg-faso px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                {importEnCours ? `Import de ${importEnCours}…` : `Importer automatiquement les ${importables.length} documents disponibles`}
              </button>
            )}
          </div>
          <p className="mt-1 text-muted">Documents officiels déjà repérés, dont le texte manque encore. « Importer » : le serveur télécharge le document sur le site officiel, en lit le texte et l'ajoute à la base (statut À VÉRIFIER). Sinon, « Télécharger » puis « Déposer » à la main. Curricula (programme) et guides de l'enseignant appartiennent à la même réforme curriculaire (API) : déposez les deux.</p>
          <ul className="mt-2 divide-y divide-line">
            {d.enAttente.map((p) => (
              <li key={p.documentId ?? p.titre} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <span className="font-mono text-xs text-muted">{p.documentId}</span> <strong>{p.titre}</strong>
                  <span className="text-muted"> · {[p.classes.join(", "), p.disciplines.join(", "), p.priorite && `priorité ${p.priorite.toLowerCase()}`].filter(Boolean).join(" · ")}</span>
                  {p.documentId && imports[p.documentId] && <span className="block text-xs">{imports[p.documentId]}</span>}
                </span>
                <span className="flex items-center gap-2">
                  {p.url && p.documentId && (
                    <button
                      type="button"
                      disabled={!!importEnCours}
                      onClick={async () => {
                        await importer(p.documentId!);
                        await charger();
                      }}
                      className="rounded-lg bg-faso px-3 py-1 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Importer
                    </button>
                  )}
                  {p.url && (
                    <a href={p.url} target="_blank" rel="noopener" className="text-xs font-semibold text-faso underline underline-offset-2">
                      Télécharger
                    </a>
                  )}
                  <button type="button" onClick={() => deposerPour(p)} className="rounded-lg border border-faso px-3 py-1 text-xs font-semibold text-faso">
                    Déposer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-line bg-white p-4 text-sm">
        <h2 className="font-bold text-faso-dark">Documents déposés ({d.documents.length})</h2>
        {!d.documents.length && <p className="mt-1 text-muted">Aucun document déposé pour le moment.</p>}
        <ul className="mt-2 divide-y divide-line">
          {d.documents.map((doc) => (
            <li key={doc.id} className="py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-mono text-xs text-muted">{doc.id}</span> <strong>{doc.titre}</strong>
                  <div className="text-xs text-muted">
                    {[DOC_TYPES[doc.type as keyof typeof DOC_TYPES] ?? doc.type, doc.classes.join(", ") || "toutes classes", doc.disciplines.join(", ") || "toutes matières", doc.annee, doc.version && `version ${doc.version}`, `${doc.caracteres.toLocaleString("fr-FR")} caractères`]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={doc.statut}
                    onChange={(e) => void changerStatut(doc, e.target.value as Statut)}
                    aria-label={`Statut de ${doc.id}`}
                    className={`rounded-lg border border-line px-2 py-1 text-xs font-semibold ${statutCls(doc.statut)}`}
                  >
                    {(Object.keys(STATUT_AIDE) as Statut[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUT_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => confirm(`Retirer ${doc.id} de la base documentaire ?`) && void envoyer({ action: "supprimer", id: doc.id }, `${doc.id} retiré de la base.`)}
                    className="text-xs text-rouge underline"
                  >
                    Retirer
                  </button>
                </div>
              </div>
              <details className="mt-1 text-xs">
                <summary className="cursor-pointer text-muted">Début du texte</summary>
                <p className="mt-1 whitespace-pre-wrap rounded bg-surface p-2">{doc.extrait}…</p>
              </details>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Tableau classe × matière : G = guide, P = programme ou curriculum, ○ = inscrit au registre mais pas encore déposé. */
function TableauCouverture({ c }: { c: Couverture }) {
  const { couvertes, total } = casesCouvertes(c);
  return (
    <section className="rounded-xl border border-line bg-white p-4 text-sm">
      <h2 className="font-bold text-faso-dark">
        Couverture par classe et matière ({couvertes}/{total})
      </h2>
      <p className="mt-1 text-xs text-muted">
        <strong className="text-faso-dark">G</strong> guide pédagogique · <strong className="text-faso-dark">P</strong> programme ou curriculum ·{" "}
        <span className="text-[#7a5a00]">○</span> inscrit au registre, à déposer · case vide : aucun document, l'assistant répond alors sans source officielle.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="p-1 text-left">Classe</th>
              {MATIERES_COUVERTURE.map((m) => (
                <th key={m.code} className="p-1 font-semibold">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CLASSES_COUVERTURE.map((cl) => (
              <tr key={cl} className="border-t border-line">
                <th className="p-1 text-left font-semibold">{cl}</th>
                {MATIERES_COUVERTURE.map((m) => {
                  const k = c[cl]?.[m.code];
                  const plein = k && (k.guide || k.programme);
                  return (
                    <td key={m.code} className={`p-1 ${plein ? "bg-faso-50 font-bold text-faso-dark" : k?.attendu ? "bg-or-50 text-[#7a5a00]" : "text-muted"}`}>
                      {plein ? [k.guide && "G", k.programme && "P"].filter(Boolean).join("+") : k?.attendu ? "○" : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
