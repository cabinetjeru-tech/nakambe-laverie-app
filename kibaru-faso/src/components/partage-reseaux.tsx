"use client";

import { useEffect, useState } from "react";

/**
 * Partage du lien de la page de présentation : menu de partage du téléphone, WhatsApp, Facebook, TikTok et copie.
 * TikTok n'accepte pas de lien à partager directement : le lien est copié, puis TikTok s'ouvre pour le coller
 * dans la description d'une vidéo ou dans la bio.
 */

type Props = {
  /** Lien à partager ; par défaut, l'adresse de la page affichée (code de parrainage compris). */
  lien?: string;
  texte?: string;
  /** Fond foncé (en-tête vert) : boutons clairs. */
  clair?: boolean;
  titre?: string | null;
  className?: string;
};

const TEXTE_DEFAUT = "PÉDAGOGUE.IA prépare vos fiches de cours, devoirs corrigés et progressions en quelques minutes, du préscolaire à la Terminale. 1 fiche offerte :";

export function IconeWhatsApp({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.06-.17-.3-.02-.46.13-.6.13-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.57-.48-.5-.67-.5h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.48.71.31 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.57.94.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44 2.52 0 4.89.99 6.67 2.77a9.37 9.37 0 0 1 2.76 6.68c0 5.2-4.24 9.43-9.45 9.43m8.04-17.47A11.3 11.3 0 0 0 12.05.7C5.78.7.68 5.8.68 12.07c0 2 .52 3.96 1.52 5.68L.58 23.7l6.1-1.6a11.33 11.33 0 0 0 5.37 1.37h.01c6.27 0 11.37-5.1 11.37-11.37 0-3.04-1.18-5.9-3.34-8.04" />
    </svg>
  );
}

export function IconeFacebook({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.02 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.03 1.79-4.7 4.53-4.7 1.31 0 2.69.23 2.69.23v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.27h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07" />
    </svg>
  );
}

export function IconeTikTok({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.3 0 .59.04.86.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43V8.69a8.16 8.16 0 0 0 4.77 1.52V6.77a4.85 4.85 0 0 1-1.04-.08" />
    </svg>
  );
}

function IconePartager({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}

function IconeLien({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** Liens de partage directs (testables). */
export function liensPartage(lien: string, texte: string) {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${texte} ${lien}`)}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lien)}`,
    tiktok: "https://www.tiktok.com/upload",
  };
}

export function PartageReseaux({ lien, texte = TEXTE_DEFAUT, clair = false, titre = "Partager PÉDAGOGUE.IA", className = "" }: Props) {
  const [url, setUrl] = useState(lien ?? "");
  const [info, setInfo] = useState<string | null>(null);
  const [natif, setNatif] = useState(false);
  useEffect(() => {
    if (!lien) {
      const u = new URL(window.location.href);
      for (const k of ["inscription", "licence", "paiement"]) u.searchParams.delete(k);
      u.hash = "";
      setUrl(u.toString());
    }
    setNatif(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [lien]);
  const l = liensPartage(url, texte);

  function signaler(t: string) {
    setInfo(t);
    setTimeout(() => setInfo(null), 6000);
  }
  async function copier(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      prompt("Copiez ce lien :", url);
      return false;
    }
  }
  async function partager() {
    try {
      await navigator.share({ title: "PÉDAGOGUE.IA", text: texte, url });
    } catch {
      /* partage annulé */
    }
  }
  async function tiktok() {
    await copier();
    signaler("Lien copié ✅ TikTok s'ouvre : collez-le dans la description de votre vidéo ou dans votre bio.");
    window.open(l.tiktok, "_blank", "noopener");
  }

  const bouton = `inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm transition hover:brightness-95`;
  return (
    <div className={className}>
      {titre && <div className={`mb-2 text-sm font-semibold ${clair ? "text-white/90" : "text-muted"}`}>{titre}</div>}
      <div className="flex flex-wrap gap-2">
        {natif && (
          <button type="button" onClick={() => void partager()} className={`${bouton} ${clair ? "bg-white text-faso-dark" : "bg-faso text-white"}`}>
            <IconePartager /> Partager
          </button>
        )}
        <a href={l.whatsapp} target="_blank" rel="noopener noreferrer" className={`${bouton} bg-[#25D366] text-white`} aria-label="Partager sur WhatsApp">
          <IconeWhatsApp /> WhatsApp
        </a>
        <a href={l.facebook} target="_blank" rel="noopener noreferrer" className={`${bouton} bg-[#1877F2] text-white`} aria-label="Partager sur Facebook">
          <IconeFacebook /> Facebook
        </a>
        <button type="button" onClick={() => void tiktok()} className={`${bouton} bg-black text-white`} aria-label="Partager sur TikTok">
          <IconeTikTok /> TikTok
        </button>
        <button
          type="button"
          onClick={async () => (await copier()) && signaler("Lien copié ✅ Collez-le où vous voulez : SMS, Telegram, e-mail…")}
          className={`${bouton} ${clair ? "border border-white/50 text-white" : "border border-line bg-white text-ink"}`}
        >
          <IconeLien /> Copier le lien
        </button>
      </div>
      {info && <p className={`mt-2 text-sm font-semibold ${clair ? "text-white" : "text-faso-dark"}`}>{info}</p>}
    </div>
  );
}
