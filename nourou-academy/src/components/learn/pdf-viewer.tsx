"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, Maximize2, Minimize2, ZoomIn, ZoomOut } from "lucide-react";
import { Watermark } from "./watermark";

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
};

/**
 * Lecteur PDF intégré (pdf.js) : pages affichées dans la plateforme, sans barre de téléchargement ni d'impression,
 * rendu progressif (pages chargées à l'approche), zoom et plein écran. Fonctionne aussi sur mobile.
 */
export function PdfViewer({ url, watermark }: { url: string; watermark: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [full, setFull] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDoc | null = null;
    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        loaded = (await pdfjs.getDocument({ url, isEvalSupported: false, withCredentials: true }).promise) as unknown as PdfDoc;
        if (!cancelled) setDoc(loaded);
      } catch {
        if (!cancelled) setError("Impossible d'afficher ce document. Vérifiez votre connexion puis rechargez la page.");
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy().catch(() => undefined);
    };
  }, [url]);

  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else box.current?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div ref={box} className={`flex flex-col overflow-hidden rounded-xl border border-line bg-slate-100 ${full ? "h-screen" : ""}`} onContextMenu={(e) => e.preventDefault()}>
      <div className="flex items-center gap-1 border-b border-line bg-white px-2 py-1.5 text-xs text-muted">
        <span className="px-2">{doc ? `${doc.numPages} page${doc.numPages > 1 ? "s" : ""}` : "Chargement…"}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(1)))} className="rounded p-1.5 hover:bg-sky-50" aria-label="Réduire"><ZoomOut className="h-4 w-4" /></button>
        <span className="w-10 text-center">{Math.round(zoom * 100)} %</span>
        <button type="button" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.2).toFixed(1)))} className="rounded p-1.5 hover:bg-sky-50" aria-label="Agrandir"><ZoomIn className="h-4 w-4" /></button>
        <button type="button" onClick={toggleFull} className="rounded p-1.5 hover:bg-sky-50" aria-label={full ? "Quitter le plein écran" : "Plein écran"}>{full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</button>
      </div>
      <div className={`overflow-auto p-3 ${full ? "flex-1" : "max-h-[75vh]"}`}>
        {error ? <p className="p-6 text-center text-sm text-red-700">{error}</p> : !doc ? (
          <div className="flex items-center justify-center p-10 text-muted"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="mx-auto space-y-3" style={{ width: `${zoom * 100}%` }}>
            {Array.from({ length: doc.numPages }, (_, i) => <PdfPageCanvas key={i} doc={doc} n={i + 1} watermark={watermark} zoom={zoom} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function PdfPageCanvas({ doc, n, watermark, zoom }: { doc: PdfDoc; n: number; watermark: string; zoom: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(n <= 2);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    const el = wrap.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const width = wrap.current?.clientWidth || 800;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: (width / base.width) * dpr });
      const c = canvas.current;
      if (!c || cancelled) return;
      c.width = viewport.width;
      c.height = viewport.height;
      const ctx = c.getContext("2d");
      if (ctx) await page.render({ canvasContext: ctx, viewport }).promise;
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc, n, visible, zoom]);

  return (
    <div ref={wrap} className="relative w-full overflow-hidden bg-white shadow-sm" style={{ aspectRatio: `1 / ${ratio}` }}>
      <canvas ref={canvas} className="block h-full w-full" />
      <Watermark text={watermark} />
      <span className="absolute bottom-1 right-2 text-[10px] text-muted">{n} / {doc.numPages}</span>
    </div>
  );
}
