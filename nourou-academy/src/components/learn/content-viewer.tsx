"use client";
import { useEffect, useState } from "react";
import { Eye, Maximize2 } from "lucide-react";
import dynamic from "next/dynamic";
import { fileKind, fileKindLabels, isOfficeViewable } from "@/lib/file-kinds";
import { FileKindIcon } from "@/components/course/file-kind-icon";
import { Watermark } from "./watermark";

const PdfViewer = dynamic(() => import("./pdf-viewer").then((m) => m.PdfViewer), { ssr: false });

export type ContentItem = { id: string; label: string; mime: string; url: string; absoluteUrl: string };

/** Support de cours consulté en ligne, avec le lecteur adapté à son type. Aucun bouton de téléchargement. */
export function ContentViewer({ item, watermark, officeEnabled }: { item: ContentItem; watermark: string; officeEnabled: boolean }) {
  const kind = fileKind(item.mime);
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-white">
      <figcaption className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm">
        <FileKindIcon kind={kind} className="h-4 w-4" />
        <span className="min-w-0 flex-1 truncate font-medium text-navy">{item.label}</span>
        <span className="inline-flex items-center gap-1 text-xs text-muted"><Eye className="h-3.5 w-3.5" aria-hidden /> {fileKindLabels[kind]} · consultation en ligne</span>
      </figcaption>
      <div className="p-3">
        {kind === "image" && (
          <div className="relative mx-auto w-fit" onContextMenu={(e) => e.preventDefault()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt={item.label} draggable={false} loading="lazy" className="max-h-[75vh] w-auto rounded-lg" />
            <Watermark text={watermark} />
          </div>
        )}
        {kind === "video" && (
          <video src={item.url} controls playsInline preload="metadata" controlsList="nodownload" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} className="aspect-video w-full rounded-lg bg-black" />
        )}
        {kind === "audio" && <audio src={item.url} controls preload="metadata" controlsList="nodownload" onContextMenu={(e) => e.preventDefault()} className="w-full" />}
        {kind === "pdf" && <PdfViewer url={item.url} watermark={watermark} />}
        {isOfficeViewable(kind) && <OfficeViewer item={item} enabled={officeEnabled} />}
        {kind === "text" && <TextViewer url={item.url} />}
        {(kind === "archive" || kind === "other") && (
          <p className="p-4 text-sm text-muted">Ce type de fichier ne peut pas être affiché en ligne. Le formateur peut le proposer en ressource téléchargeable.</p>
        )}
      </div>
    </figure>
  );
}

function OfficeViewer({ item, enabled }: { item: ContentItem; enabled: boolean }) {
  const [big, setBig] = useState(false);
  if (!enabled) {
    return <p className="p-4 text-sm text-muted">L'affichage des présentations et documents Office nécessite la plateforme en ligne (adresse https publique).</p>;
  }
  const src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(item.absoluteUrl)}`;
  return (
    <div>
      <iframe src={src} title={item.label} className={`w-full rounded-lg border-0 ${big ? "h-[85vh]" : "aspect-video"}`} allow="fullscreen" allowFullScreen />
      <button type="button" onClick={() => setBig((b) => !b)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky hover:underline">
        <Maximize2 className="h-3.5 w-3.5" aria-hidden /> {big ? "Taille normale" : "Agrandir"}
      </button>
    </div>
  );
}

function TextViewer({ url }: { url: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch(url, { credentials: "include" }).then((r) => (r.ok ? r.text() : "")).then((t) => setText(t.slice(0, 200_000))).catch(() => setText(""));
  }, [url]);
  if (text === null) return <p className="p-4 text-sm text-muted">Chargement…</p>;
  return <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-4 text-sm">{text}</pre>;
}
