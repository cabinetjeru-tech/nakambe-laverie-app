"use client";
import { useRef, useState } from "react";
import { PlayCircle } from "lucide-react";

/**
 * Visuel d'une carte du catalogue. Si la formation a une vidéo de présentation téléversée, un aperçu muet
 * se lance au survol (ordinateur uniquement, jamais en mode faible consommation).
 */
export function CardMedia({ title, image, category, gradient, trailerFile, hasTrailer }: { title: string; image: string | null; category?: string | null; gradient: string; trailerFile: string | null; hasTrailer: boolean }) {
  const [play, setPlay] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    if (!trailerFile || document.body.classList.contains("low-data") || !window.matchMedia("(hover: hover)").matches) return;
    timer.current = setTimeout(() => setPlay(true), 350);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    setPlay(false);
  };
  return (
    <div className={`relative aspect-[16/9] overflow-hidden bg-gradient-to-br ${gradient}`} onMouseEnter={start} onMouseLeave={stop}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" loading="lazy" decoding="async" className="decorative absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="hero-grid absolute inset-0 flex items-end p-4">
          <span className="line-clamp-2 text-lg font-bold leading-snug text-white/95">{title}</span>
        </div>
      )}
      {play && trailerFile && <video src={trailerFile} autoPlay muted loop playsInline preload="auto" className="absolute inset-0 h-full w-full object-cover" />}
      {category && <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-navy">{category}</span>}
      {hasTrailer && !play && (
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white">
          <PlayCircle className="h-3.5 w-3.5" aria-hidden /> Vidéo de présentation
        </span>
      )}
    </div>
  );
}
