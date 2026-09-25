"use client";
import { useState } from "react";
import { renderMarkdown } from "@/lib/markdown";

/** Éditeur Markdown simple avec aperçu (rendu sécurisé identique à celui des apprenants). */
export function MarkdownEditor({ name, defaultValue, rows = 18 }: { name: string; defaultValue?: string; rows?: number }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [preview, setPreview] = useState(false);
  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center gap-1 border-b border-line bg-surface px-2 py-1.5 text-xs">
        <button type="button" onClick={() => setPreview(false)} className={`rounded px-2 py-1 ${!preview ? "bg-white font-semibold text-navy shadow-sm" : "text-muted"}`}>Rédiger</button>
        <button type="button" onClick={() => setPreview(true)} className={`rounded px-2 py-1 ${preview ? "bg-white font-semibold text-navy shadow-sm" : "text-muted"}`}>Aperçu</button>
        <span className="ml-auto hidden text-muted sm:inline">## Titre · **gras** · *italique* · - liste · | tableau | · [lien](https://…)</span>
      </div>
      <textarea name={name} value={value} onChange={(e) => setValue(e.target.value)} rows={rows} className={`block w-full resize-y rounded-b-xl px-3 py-2 font-mono text-sm focus:outline-none ${preview ? "hidden" : ""}`} />
      {preview && <div className="prose-nga min-h-40 px-4 py-3" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) || "<p class='text-muted'>Rien à afficher.</p>" }} />}
    </div>
  );
}
