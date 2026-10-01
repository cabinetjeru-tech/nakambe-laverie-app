"use client";

import { useState } from "react";
import type { TeacherContext } from "@/lib/conversation";
import { buildEvalRequest, emptyEval, EVAL_TYPES, evalMissing, QUESTION_TYPES, type EvalForm } from "@/lib/evaluation";
import { OptionsClasses } from "./options-classes";
import { disciplinesPour } from "@/lib/templates";

/** Module 02 — formulaire du générateur de devoirs et évaluations. Requis : classe, discipline, notions évaluées. */

const inputCls = "mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";

export function EvalFormDialog({
  context,
  initialType,
  onClose,
  onSubmit,
}: {
  context: TeacherContext;
  initialType?: string;
  onClose: () => void;
  onSubmit: (message: string, ctx: Partial<TeacherContext>) => void;
}) {
  const [f, setF] = useState<EvalForm>(() => emptyEval(context, initialType));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<EvalForm>) => setF((x) => ({ ...x, ...patch }));
  const missing = evalMissing(f);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="eval-titre" onClick={onClose}>
      <form
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (missing.length) return;
          const { message, context: ctx } = buildEvalRequest(f);
          onSubmit(message, ctx);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="eval-titre" className="text-lg font-bold text-faso-dark">
              Générateur de devoirs et évaluations
            </h2>
            <p className="text-xs text-muted">Tableau de spécification → sujet → corrigé → barème, puis contrôle automatique des points et des calculs.</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-rouge" aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="text-xs font-medium text-muted">
            Classe *
            <select value={f.classe} onChange={(e) => set({ classe: e.target.value })} className={inputCls}>
              <option value="">—</option>
              <OptionsClasses />
            </select>
          </label>
          <label className="text-xs font-medium text-muted sm:col-span-2">
            Discipline *
            <input list="eval-disciplines" value={f.discipline} onChange={(e) => set({ discipline: e.target.value })} className={inputCls} placeholder="Mathématiques" />
            <datalist id="eval-disciplines">
              {disciplinesPour(f.classe).map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
            Notions ou chapitres évalués *
            <input value={f.notions} onChange={(e) => set({ notions: e.target.value })} className={inputCls} placeholder="Équations du premier degré ; problèmes" />
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-1">
            Type d&apos;évaluation
            <select
              value={f.type}
              onChange={(e) => {
                const d = emptyEval({}, e.target.value);
                set({ type: e.target.value, duree: d.duree, bareme: d.bareme });
              }}
              className={inputCls}
            >
              {EVAL_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Durée
            <input value={f.duree} onChange={(e) => set({ duree: e.target.value })} className={inputCls} />
          </label>
          <label className="text-xs font-medium text-muted">
            Noté sur
            <select value={f.bareme} onChange={(e) => set({ bareme: e.target.value })} className={inputCls}>
              {["10", "20", "40", "100"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Nombre d&apos;exercices
            <input value={f.exercices} onChange={(e) => set({ exercices: e.target.value })} className={inputCls} placeholder="au choix" inputMode="numeric" />
          </label>
          <label className="text-xs font-medium text-muted">
            Difficulté
            <select value={f.difficulte} onChange={(e) => set({ difficulte: e.target.value as EvalForm["difficulte"] })} className={inputCls}>
              <option value="équilibrée">Équilibrée</option>
              <option value="accessible">Accessible</option>
              <option value="exigeante">Exigeante</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Versions
            <select value={f.versions} onChange={(e) => set({ versions: Number(e.target.value) })} className={inputCls}>
              <option value={1}>Une seule</option>
              <option value={2}>A et B</option>
              <option value={3}>A, B et C</option>
            </select>
          </label>
        </div>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted">Types de questions (facultatif)</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {QUESTION_TYPES.map((q) => {
              const on = f.questionTypes.includes(q);
              return (
                <button
                  key={q}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ questionTypes: on ? f.questionTypes.filter((x) => x !== q) : [...f.questionTypes, q] })}
                  className={`rounded-full border px-3 py-1 text-xs ${on ? "border-faso bg-faso text-white" : "border-line text-ink hover:border-faso"}`}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-wide text-muted">Documents à produire</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-faso" checked={f.corrige} onChange={(e) => set({ corrige: e.target.checked })} /> Corrigé détaillé
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-faso" checked={f.specification} onChange={(e) => set({ specification: e.target.checked })} /> Tableau de spécification
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" className="accent-faso" checked={f.grille} onChange={(e) => set({ grille: e.target.checked })} /> Grille critériée
            </label>
          </div>
          <label className="mt-3 block text-xs font-medium text-muted">
            Consignes particulières
            <input value={f.consignes} onChange={(e) => set({ consignes: e.target.value })} className={inputCls} placeholder="Calculatrice interdite, sujet sur une page…" />
          </label>
        </fieldset>

        {tried && missing.length > 0 && <p className="mt-3 text-sm text-rouge">À compléter : {missing.join(", ")}.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">
            Annuler
          </button>
          <button type="submit" className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white hover:bg-faso-dark">
            Générer l&apos;évaluation
          </button>
        </div>
      </form>
    </div>
  );
}
