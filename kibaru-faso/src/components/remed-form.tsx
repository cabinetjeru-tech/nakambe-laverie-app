"use client";

import { useState } from "react";
import type { TeacherContext } from "@/lib/conversation";
import { buildRemedRequest, emptyRemed, PUBLICS, remedMissing, type RemedForm } from "@/lib/remediation";
import { CLASSES } from "@/lib/search";
import { DISCIPLINES } from "@/lib/templates";

/** Module 03 — formulaire du générateur de remédiation. Requis : classe, discipline, notion, difficulté observée. */

const inputCls = "mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";

export function RemedFormDialog({ context, onClose, onSubmit }: { context: TeacherContext; onClose: () => void; onSubmit: (message: string, ctx: Partial<TeacherContext>) => void }) {
  const [f, setF] = useState<RemedForm>(() => emptyRemed(context));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<RemedForm>) => setF((x) => ({ ...x, ...patch }));
  const missing = remedMissing(f);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="remed-titre" onClick={onClose}>
      <form
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (missing.length) return;
          const { message, context: ctx } = buildRemedRequest(f);
          onSubmit(message, ctx);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="remed-titre" className="text-lg font-bold text-faso-dark">
              Générateur de remédiation
            </h2>
            <p className="text-xs text-muted">Difficulté → hypothèses → diagnostic → remédiation → exercices → nouvelle vérification → consolidation.</p>
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
              {CLASSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted sm:col-span-2">
            Discipline *
            <input list="remed-disciplines" value={f.discipline} onChange={(e) => set({ discipline: e.target.value })} className={inputCls} placeholder="Mathématiques" />
            <datalist id="remed-disciplines">
              {DISCIPLINES.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
            Notion concernée *
            <input value={f.notion} onChange={(e) => set({ notion: e.target.value })} className={inputCls} placeholder="Addition de fractions" />
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
            Difficulté observée *
            <textarea
              value={f.difficulte}
              onChange={(e) => set({ difficulte: e.target.value })}
              rows={2}
              className={`${inputCls} resize-y`}
              placeholder="Les élèves additionnent les numérateurs et les dénominateurs."
            />
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
            Exemple d&apos;erreur d&apos;élève (facultatif)
            <input value={f.exempleErreur} onChange={(e) => set({ exempleErreur: e.target.value })} className={inputCls} placeholder="1/2 + 1/3 = 2/5" />
          </label>
          <label className="text-xs font-medium text-muted">
            Public
            <select value={f.public} onChange={(e) => set({ public: e.target.value })} className={inputCls}>
              {PUBLICS.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Élèves concernés
            <input value={f.concernes} onChange={(e) => set({ concernes: e.target.value })} className={inputCls} placeholder="environ 20" />
          </label>
          <label className="text-xs font-medium text-muted">
            Durée disponible
            <input value={f.duree} onChange={(e) => set({ duree: e.target.value })} className={inputCls} />
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
            Matériel disponible (facultatif)
            <input value={f.materiel} onChange={(e) => set({ materiel: e.target.value })} className={inputCls} placeholder="Tableau, craie, bouchons, bandes de papier…" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-faso" checked={f.differenciation} onChange={(e) => set({ differenciation: e.target.checked })} /> Différenciation en trois niveaux
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-faso" checked={f.maison} onChange={(e) => set({ maison: e.target.checked })} /> Consolidation à la maison
          </label>
        </div>

        {tried && missing.length > 0 && <p className="mt-3 text-sm text-rouge">À compléter : {missing.join(", ")}.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">
            Annuler
          </button>
          <button type="submit" className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white hover:bg-faso-dark">
            Générer la remédiation
          </button>
        </div>
      </form>
    </div>
  );
}
