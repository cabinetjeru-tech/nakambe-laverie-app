"use client";
import { useEffect, useState } from "react";
import { Play, X } from "lucide-react";

export type Trailer = { kind: "file" | "embed"; src: string } | null;

/** Visuel de la formation ; si une vidéo de présentation existe, un bouton lecture l'ouvre dans une fenêtre. */
export function TrailerPreview({ cover, title, trailer, gradient }: { cover: string | null; title: string; trailer: Trailer; gradient: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const visual = (
    <div className={`relative aspect-video overflow-hidden bg-gradient-to-br ${gradient}`}>
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="hero-grid absolute inset-0 flex items-end p-4"><span className="line-clamp-2 text-lg font-bold text-white/95">{title}</span></div>
      )}
      {trailer && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-t from-black/60 via-black/10 to-black/10 text-white">
          <span className="grid h-16 w-16 place-items-center rounded-full bg-white/95 shadow-lg transition group-hover:scale-105"><Play className="ml-1 h-7 w-7 fill-navy text-navy" aria-hidden /></span>
          <span className="text-sm font-semibold drop-shadow">Voir la présentation</span>
        </span>
      )}
    </div>
  );

  if (!trailer) return visual;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group block w-full text-left" aria-label={`Lire la vidéo de présentation : ${title}`}>{visual}</button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label="Vidéo de présentation" onClick={() => setOpen(false)}>
          <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-3 text-white">
              <div className="min-w-0"><div className="text-xs uppercase tracking-wide text-white/70">Présentation de la formation</div><div className="truncate font-semibold">{title}</div></div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-full p-2 hover:bg-white/10" aria-label="Fermer"><X className="h-5 w-5" /></button>
            </div>
            {trailer.kind === "embed" ? (
              <iframe src={trailer.src} title="Vidéo de présentation" className="aspect-video w-full rounded-xl bg-black" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
            ) : (
              <video src={trailer.src} controls autoPlay playsInline controlsList="nodownload" className="aspect-video w-full rounded-xl bg-black" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
