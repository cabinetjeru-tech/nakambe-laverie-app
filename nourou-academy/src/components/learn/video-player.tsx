"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Gauge, Play } from "lucide-react";
import { sendProgress } from "./offline-queue";

type Track = { src: string; lang: string; label: string };

function embedUrl(url: string): string | null {
  const yt = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/.exec(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/**
 * Lecteur vidéo : vitesse réglable, sous-titres (WebVTT), reprise de lecture,
 * sauvegarde de la progression (avec file d'attente hors ligne), mode faible débit.
 */
export function VideoPlayer({
  lessonId,
  src,
  tracks = [],
  initialPosition = 0,
  lowData,
  downloadUrl,
}: {
  lessonId: string;
  src: string;
  tracks?: Track[];
  initialPosition?: number;
  lowData: boolean;
  downloadUrl?: string | null;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);
  const [started, setStarted] = useState(!lowData);
  const lastSent = useRef(0);
  const completedSent = useRef(false);
  const external = embedUrl(src);

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("nga_rate"));
      if (saved >= 0.5 && saved <= 2) setRate(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, started]);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const onLoaded = () => {
      if (initialPosition > 5 && initialPosition < v.duration - 5) v.currentTime = initialPosition;
    };
    const save = (force = false) => {
      const now = Date.now();
      if (!force && now - lastSent.current < 15_000) return;
      lastSent.current = now;
      void sendProgress({ lessonId, position: Math.floor(v.currentTime) });
    };
    const onTime = () => {
      save();
      if (!completedSent.current && v.duration && v.currentTime / v.duration > 0.9) {
        completedSent.current = true;
        void sendProgress({ lessonId, completed: true, position: Math.floor(v.currentTime) });
      }
    };
    const onPause = () => save(true);
    const onHide = () => document.visibilityState === "hidden" && save(true);
    v.addEventListener("loadedmetadata", onLoaded);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onPause);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      v.removeEventListener("loadedmetadata", onLoaded);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onPause);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [lessonId, initialPosition, started]);

  if (external) {
    return (
      <div className="overflow-hidden rounded-2xl bg-black">
        {started ? (
          <iframe src={external} className="aspect-video w-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title="Vidéo de la leçon" loading="lazy" />
        ) : (
          <LowDataGate onStart={() => setStarted(true)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-2xl bg-black">
        {started ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={ref} controls playsInline preload={lowData ? "none" : "metadata"} className="aspect-video w-full" src={src} controlsList="nodownload">
            {tracks.map((t, i) => <track key={t.src} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} default={i === 0} />)}
            Votre navigateur ne peut pas lire cette vidéo.
          </video>
        ) : (
          <LowDataGate onStart={() => setStarted(true)} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2 text-muted">
          <Gauge className="h-4 w-4" aria-hidden /> Vitesse
          <select
            value={rate}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRate(r);
              try {
                localStorage.setItem("nga_rate", String(r));
              } catch {}
            }}
            className="rounded-md border border-line bg-white px-2 py-1 text-sm text-navy"
          >
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        {tracks.length > 0 && <span className="text-xs text-muted">Sous-titres disponibles ({tracks.map((t) => t.label).join(", ")}) — bouton CC du lecteur.</span>}
        {initialPosition > 5 && <span className="text-xs text-muted">Reprise automatique à {Math.floor(initialPosition / 60)} min {initialPosition % 60} s.</span>}
        {downloadUrl && (
          <a href={downloadUrl} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline">
            <Download className="h-3.5 w-3.5" aria-hidden /> Télécharger la vidéo
          </a>
        )}
      </div>
    </div>
  );
}

function LowDataGate({ onStart }: { onStart: () => void }) {
  return (
    <button onClick={onStart} className="flex aspect-video w-full flex-col items-center justify-center gap-2 bg-navy text-white">
      <Play className="h-12 w-12" aria-hidden />
      <span className="text-sm font-medium">Charger la vidéo</span>
      <span className="text-xs text-sky-200">Mode faible consommation : la vidéo ne se charge qu'à votre demande.</span>
    </button>
  );
}
