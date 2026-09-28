"use client";

import { useState } from "react";
import type { TeacherContext } from "@/lib/conversation";
import { buildProgRequest, emptyProg, PERIODES, progMissing, type ProgForm } from "@/lib/progression";
import { CLASSES } from "@/lib/search";
import { DISCIPLINES } from "@/lib/templates";

/** Module 04 — formulaire du générateur de progressions. Requis : classe, discipline, volume horaire hebdomadaire. */

const inputCls = "mt-1 w-full rounded-lg border border-line px-2.5 py-1.5 text-sm focus:border-faso focus:outline-none";

export function ProgFormDialog({ context, onClose, onSubmit }: { context: TeacherContext; onClose: () => void; onSubmit: (message: string, ctx: Partial<TeacherContext>) => void }) {
  const [f, setF] = useState<ProgForm>(() => emptyProg(context));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<ProgForm>) => setF((x) => ({ ...x, ...patch }));
  const missing = progMissing(f);
  const h = parseFloat(f.heuresSemaine.replace(",", "."));
  const w = parseInt(f.semaines, 10);
  const dispo = h > 0 && w > 0 ? Math.round(h * w * 10) / 10 : undefined;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="prog-titre" onClick={onClose}>
      <form
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          setTried(true);
          if (missing.length) return;
          const { message, context: ctx } = buildProgRequest(f);
          onSubmit(message, ctx);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="prog-titre" className="text-lg font-bold text-faso-dark">
              Générateur de progressions
            </h2>
            <p className="text-xs text-muted">Documentation → paramètres → répartition → évaluations → réserve → contrôle du volume horaire.</p>
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
            <input list="prog-disciplines" value={f.discipline} onChange={(e) => set({ discipline: e.target.value })} className={inputCls} placeholder="Mathématiques" />
            <datalist id="prog-disciplines">
              {DISCIPLINES.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </label>
          <label className="text-xs font-medium text-muted">
            Période
            <select value={f.periode} onChange={(e) => set({ periode: e.target.value })} className={inputCls}>
              {PERIODES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-muted">
            Heures par semaine *
            <input inputMode="decimal" value={f.heuresSemaine} onChange={(e) => set({ heuresSemaine: e.target.value })} className={inputCls} placeholder="4" />
          </label>
          <label className="text-xs font-medium text-muted">
            Durée d&apos;une séance
            <input value={f.dureeSeance} onChange={(e) => set({ dureeSeance: e.target.value })} className={inputCls} />
          </label>
          <label className="text-xs font-medium text-muted">
            Nombre de semaines
            <input inputMode="numeric" value={f.semaines} onChange={(e) => set({ semaines: e.target.value })} className={inputCls} placeholder="à préciser" />
          </label>
          <label className="text-xs font-medium text-muted sm:col-span-2">
            Date de début (facultatif)
            <input value={f.debut} onChange={(e) => set({ debut: e.target.value })} className={inputCls} placeholder="lundi 5 octobre" />
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
            Chapitres à couvrir (facultatif — sinon ceux de la base documentaire, ou une proposition)
            <textarea
              value={f.chapitres}
              onChange={(e) => set({ chapitres: e.target.value })}
              rows={2}
              className={`${inputCls} resize-y`}
              placeholder="Nombres entiers ; Fractions ; Droites et segments ; Périmètres et aires…"
            />
          </label>
          <label className="col-span-2 text-xs font-medium text-muted sm:col-span-3">
            Semaines réservées (facultatif)
            <input value={f.reservees} onChange={(e) => set({ reservees: e.target.value })} className={inputCls} placeholder="semaine 12 : compositions ; semaine 20 : congés" />
          </label>
        </div>

        <p className="mt-3 text-xs text-muted">
          {dispo !== undefined
            ? `Heures disponibles : ${String(h).replace(".", ",")} h × ${w} semaines = ${String(dispo).replace(".", ",")} h. `
            : "Sans nombre de semaines, PÉDAGOGUE.IA retiendra une hypothèse de travail et l'annoncera. "}
          Le volume horaire et le calendrier officiels ne sont jamais devinés : renseignez-les d&apos;après votre emploi du temps.
        </p>

        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-faso" checked={f.evaluations} onChange={(e) => set({ evaluations: e.target.checked })} /> Placer les évaluations
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-faso" checked={f.marge} onChange={(e) => set({ marge: e.target.checked })} /> Marge de rattrapage
          </label>
        </div>

        {tried && missing.length > 0 && <p className="mt-3 text-sm text-rouge">À compléter : {missing.join(", ")}.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm">
            Annuler
          </button>
          <button type="submit" className="rounded-lg bg-faso px-4 py-2 text-sm font-semibold text-white hover:bg-faso-dark">
            Générer la progression
          </button>
        </div>
      </form>
    </div>
  );
}
