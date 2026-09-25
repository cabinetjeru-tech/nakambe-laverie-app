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

  const finish = (ok: boolean, file: File, body: { id?: string; url?: string | null; error?: string }) => {
    setProgress(null);
    if (ok && body.id) {
      setDone(`« ${file.name} » téléversé.${showUrl && body.url ? ` Adresse : ${body.url}` : ""}`);
      onUploaded?.({ id: body.id, url: body.url ?? null });
      router.refresh();
    } else setError(body.error ?? "Échec du téléversement.");
    if (input.current) input.current.value = "";
  };

  /** Envoi XHR avec progression. */
  const send = (method: string, url: string, file: File, headers: Record<string, string>) =>
    new Promise<{ status: number; text: string }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url);
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => e.lengthComputable && setProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
      xhr.onerror = () => reject(new Error("network"));
      xhr.send(file);
    });

  async function upload(file: File) {
    setError(null);
    setDone(null);
    setProgress(0);
    const fields = { ...params, ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)) };
    const meta = { ...fields, filename: file.name, contentType: file.type || "application/octet-stream", size: file.size };
    try {
      // 1. Envoi direct vers le stockage si disponible (S3 / Supabase Storage).
      const init = await fetch("/api/upload/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "init", ...meta }) });
      const initBody = (await init.json().catch(() => ({}))) as { mode?: string; url?: string; key?: string; token?: string; contentType?: string; error?: string };
      if (!init.ok) return finish(false, file, initBody);
      if (initBody.mode === "direct" && initBody.url) {
        const put = await send("PUT", initBody.url, file, { "Content-Type": initBody.contentType ?? "application/octet-stream" });
        if (put.status < 200 || put.status >= 300) return finish(false, file, { error: "Le stockage a refusé le fichier (vérifiez la configuration CORS du stockage)." });
        setProgress(100);
        const done = await fetch("/api/upload/direct", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "complete", ...meta, key: initBody.key, token: initBody.token }) });
        return finish(done.ok, file, await done.json().catch(() => ({})));
      }
      // 2. Sinon, envoi via le serveur (stockage local).
      const res = await send("POST", `/api/upload?${new URLSearchParams(fields).toString()}`, file, { "X-Filename": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" });
      let body: { id?: string; url?: string | null; error?: string } = {};
      try {
        body = JSON.parse(res.text);
      } catch {}
      finish(res.status >= 200 && res.status < 300, file, body);
    } catch {
      setProgress(null);
      setError("Connexion interrompue pendant l'envoi. Réessayez.");
    }
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
