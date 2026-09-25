"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UploadCloud } from "lucide-react";

/**
 * Téléversement avec barre de progression (XHR) — utile en connexion lente.
 * Envoie le fichier brut vers /api/upload avec les paramètres d'usage.
 */
export function FileUploader({
  params,
  accept,
  label = "Choisir un fichier",
  hint,
  onUploaded,
  extraFields,
  showUrl,
}: {
  params: Record<string, string>;
  accept?: string;
  label?: string;
  hint?: string;
  onUploaded?: (res: { id: string; url: string | null }) => void;
  extraFields?: { name: string; label: string; placeholder?: string }[];
  showUrl?: boolean;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  function upload(file: File) {
    setError(null);
    setDone(null);
    setProgress(0);
    const qs = new URLSearchParams({ ...params, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/upload?${qs.toString()}`);
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      setProgress(null);
      let body: { id?: string; url?: string | null; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && body.id) {
        setDone(`« ${file.name} » téléversé.${showUrl && body.url ? ` Adresse : ${body.url}` : ""}`);
        onUploaded?.({ id: body.id, url: body.url ?? null });
        router.refresh();
      } else setError(body.error ?? "Échec du téléversement.");
      if (input.current) input.current.value = "";
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Connexion interrompue pendant l'envoi. Réessayez.");
    };
    xhr.send(file);
  }

  return (
    <div className="space-y-2">
      {extraFields?.map((f) => (
        <input key={f.name} placeholder={f.placeholder ?? f.label} aria-label={f.label} value={extra[f.name] ?? ""} onChange={(e) => setExtra((x) => ({ ...x, [f.name]: e.target.value }))} className="h-9 w-full rounded-lg border border-line px-3 text-sm" />
      ))}
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-surface px-4 py-5 text-sm font-medium text-navy hover:border-sky hover:bg-sky-50">
        {progress !== null ? <Loader2 className="h-5 w-5 animate-spin" /> : <UploadCloud className="h-5 w-5 text-sky" />}
        {progress !== null ? `Envoi… ${progress} %` : label}
        <input ref={input} type="file" accept={accept} className="hidden" disabled={progress !== null} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {progress !== null && <div className="h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full bg-sky transition-all" style={{ width: `${progress}%` }} /></div>}
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
      {done && <p className="text-xs text-emerald-700">{done}</p>}
    </div>
  );
}
