"use client";

import { useEffect, useState } from "react";

type InvitationInstallation = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Enregistre le service worker (application installable, page hors connexion). */
export function EnregistrementSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}

function estInstallee(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Bouton « Installer l'application » : invitation native sur Android (Chrome), mode d'emploi sur iPhone (Safari).
 * Invisible quand l'application est déjà installée ou que le navigateur ne le permet pas.
 */
export function BoutonInstaller({ className = "", clair = false }: { className?: string; clair?: boolean }) {
  const [invitation, setInvitation] = useState<InvitationInstallation | null>(null);
  const [ios, setIos] = useState(false);
  const [aide, setAide] = useState(false);
  const [installee, setInstallee] = useState(true);

  useEffect(() => {
    setInstallee(estInstallee());
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const garder = (e: Event) => {
      e.preventDefault();
      setInvitation(e as InvitationInstallation);
    };
    const fini = () => {
      setInstallee(true);
      setInvitation(null);
    };
    window.addEventListener("beforeinstallprompt", garder);
    window.addEventListener("appinstalled", fini);
    return () => {
      window.removeEventListener("beforeinstallprompt", garder);
      window.removeEventListener("appinstalled", fini);
    };
  }, []);

  if (installee || (!invitation && !ios)) return null;
  const style = clair
    ? "rounded-lg border border-white/60 bg-white/10 px-4 py-2.5 font-semibold text-white hover:bg-white/20"
    : "rounded-lg border border-faso bg-white px-4 py-2 font-semibold text-faso hover:bg-faso-50";
  return (
    <div className={className}>
      <button
        type="button"
        className={style}
        onClick={async () => {
          if (!invitation) return setAide((v) => !v);
          await invitation.prompt();
          await invitation.userChoice.catch(() => undefined);
          setInvitation(null);
        }}
      >
        📲 Installer l&apos;application sur mon téléphone
      </button>
      {aide && (
        <p className={`mt-2 max-w-sm text-sm ${clair ? "text-white/90" : "text-muted"}`}>
          Sur iPhone : touchez le bouton <strong>Partager</strong> (carré avec une flèche) en bas de Safari, puis <strong>« Sur l&apos;écran d&apos;accueil »</strong>.
        </p>
      )}
    </div>
  );
}
