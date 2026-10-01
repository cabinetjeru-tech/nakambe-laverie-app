"use client";

import { useState } from "react";
import { TYPES_SEANCE, type TeacherContext } from "@/lib/conversation";
import { buildFicheRequest, emptyFiche, ficheMissing, type FicheForm } from "@/lib/fiche";
import { OptionsClasses } from "./options-classes";
import { disciplinesPour } from "@/lib/templates";

/**
 * Module 01 — formulaire structuré du générateur de fiches pédagogiques (sections 3 et 4).
 * Seuls la classe, la discipline et le thème sont requis ; les informations pédagogiques sont facultatives.
 */

const inputCls = "mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";

export function FicheFormDialog({ context, onClose, onSubmit }: { context: TeacherContext; onClose: () => void; onSubmit: (message: string, ctx: Partial<TeacherContext>) => void }) {
  const [f, setF] = useState<FicheForm>(() => emptyFiche(context));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<FicheForm>) => setF((x) => ({ ...x, ...patch }));
  const missing = ficheMissing(f);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="fiche-titre" onClick={onClose}>
      <form
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (missing.length) return;
          const { message, context: ctx } = buildFicheRequest(f);
          onSubmit(message, ctx);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="fiche-titre" className="text-lg font-bold text-faso-dark">
              Générateur de fiches pédagogiques
            </h2>
            <p className="text-xs text-muted">Documentation → analyse → proposition pédagogique → fiche. Seuls la classe, la discipline et le thème sont requis.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-rouge" aria-label="Fermer">
            ✕
          </button>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted">Informations principales</legend>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-muted">
              Classe *
              <select value={f.classe} onChange={(e) => set({ classe: e.target.value })} className={inputCls} aria-invalid={tried && !f.classe}>
                <option value="">—</option>
                <OptionsClasses />
              </select>
            </label>
            <label className="col-span-1 text-xs font-medium text-muted sm:col-span-2">
              Discipline *
              <input list="fiche-disciplines" value={f.discipline} onChange={(e) => set({ discipline: e.target.value })} className={inputCls} placeholder="Mathématiques" />
              <datalist id="fiche-disciplines">
                {disciplinesPour(f.classe).map((d) => (
                  <option key={d} value={d} />
                ))}
              </datalist>
            </label>
            <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
              Thème *
              <input value={f.theme} onChange={(e) => set({ theme: e.target.value })} className={inputCls} placeholder="Les fractions" />
            </label>
            <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
              Sous-thème / notion
              <input value={f.sousTheme} onChange={(e) => set({ sousTheme: e.target.value })} className={inputCls} placeholder="Comparer des fractions de même dénominateur" />
            </label>
            <label className="text-xs font-medium text-muted">
              Type de séance
              <select value={f.typeSeance} onChange={(e) => set({ typeSeance: e.target.value })} className={inputCls}>
                {TYPES_SEANCE.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-muted">
              Durée
              <input value={f.duree} onChange={(e) => set({ duree: e.target.value })} className={inputCls} placeholder="55 minutes" />
            </label>
            <label className="text-xs font-medium text-muted">
              Nombre d&apos;apprenants
              <input value={f.effectif} onChange={(e) => set({ effectif: e.target.value })} className={inputCls} placeholder="85" />
            </label>
          </div>
        </fieldset>

        <details className="mt-4 rounded-lg bg-surface px-3 py-2">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-muted">Informations pédagogiques facultatives</summary>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-muted">
              Niveau général de la classe
              <select value={f.niveau} onChange={(e) => set({ niveau: e.target.value })} className={inputCls}>
                <option value="">—</option>
                <option value="faible">Faible</option>
                <option value="moyen">Moyen</option>
                <option value="bon">Bon</option>
                <option value="hétérogène">Hétérogène</option>
              </select>
            </label>
            {(
              [
                ["difficultes", "Difficultés particulières", "Confusion numérateur / dénominateur…"],
                ["prerequis", "Prérequis déjà maîtrisés", "Partage d'une unité en parts égales…"],
                ["materiel", "Matériel disponible", "Tableau, craie, cahiers, bouteilles…"],
                ["methode", "Méthode souhaitée", "Travail en groupes, démarche d'investigation…"],
                ["contexteParticulier", "Contexte particulier", "Classe pléthorique, pas d'électricité…"],
                ["objectifPersonnel", "Objectif personnel de la séance", ""],
              ] as const
            ).map(([k, label, ph]) => (
              <label key={k} className="text-xs font-medium text-muted">
                {label}
                <input value={f[k]} onChange={(e) => set({ [k]: e.target.value } as Partial<FicheForm>)} className={inputCls} placeholder={ph} />
              </label>
            ))}
          </div>
        </details>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted">Production</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["standard", "Standard", "Fiche complète"],
                ["expert", "Expert", "Choix pédagogiques, erreurs fréquentes…"],
                ["rapide", "Rapide", "Objectif, activité, déroulement, évaluation, devoir"],
              ] as const
            ).map(([v, label, hint]) => (
              <label key={v} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${f.mode === v ? "border-faso bg-faso-50" : "border-line"}`}>
                <input type="radio" name="mode" className="sr-only" checked={f.mode === v} onChange={() => set({ mode: v })} />
                <span className="font-semibold">{label}</span>
                <span className="block text-[11px] text-muted">{hint}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-faso" checked={f.corrige} onChange={(e) => set({ corrige: e.target.checked })} /> Inclure le corrigé
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-faso" checked={f.differenciation} onChange={(e) => set({ differenciation: e.target.checked })} /> Différenciation
            </label>
          </div>
        </fieldset>

        {tried && missing.length > 0 && <p className="mt-3 text-sm text-rouge">À compléter : {missing.join(", ")}.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">
            Annuler
          </button>
          <button type="submit" className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white hover:bg-faso-dark">
            Générer la fiche
          </button>
        </div>
      </form>
    </div>
  );
}
