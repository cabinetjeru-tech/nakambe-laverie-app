"use client";
import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";

/** Liens à copier ou à envoyer par WhatsApp (ex. liens d'activation de compte). */
export function LinkList({ links }: { links: { label: string; url: string }[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
    } catch {
      setCopied(null);
    }
  };
  return (
    <ul className="mb-4 space-y-2 rounded-xl border border-line bg-white p-3 text-sm">
      {links.map((l) => (
        <li key={l.url} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <span className="min-w-0 flex-1">
            <span className="break-words font-medium text-navy">{l.label}</span>
            <span className="block truncate text-xs text-muted">{l.url}</span>
          </span>
          <span className="flex shrink-0 gap-2">
            <button type="button" onClick={() => copy(l.url)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs">
              {copied === l.url ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />} Copier
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`Bonjour ! Voici votre lien personnel pour choisir votre mot de passe et accéder à votre compte (valable 72 h) : ${l.url}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> WhatsApp
            </a>
          </span>
        </li>
      ))}
    </ul>
  );
}
