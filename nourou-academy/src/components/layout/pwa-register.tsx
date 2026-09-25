"use client";
import { useEffect, useState } from "react";
import { Download, WifiOff, X } from "lucide-react";
import { flushProgressQueue } from "@/components/learn/offline-queue";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Enregistre le service worker, propose l'installation (Android) et affiche l'état hors ligne. */
export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [offline, setOffline] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    try {
      setDismissed(localStorage.getItem("nga_install_dismissed") === "1");
    } catch {
      setDismissed(false);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const update = () => {
      setOffline(!navigator.onLine);
      if (navigator.onLine) flushProgressQueue();
    };
    const onLogout = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-logout]")) navigator.serviceWorker?.controller?.postMessage("logout");
    };
    document.addEventListener("click", onLogout);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
    return () => {
      document.removeEventListener("click", onLogout);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <>
      {offline && (
        <div className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-amber-500 px-3 py-1.5 text-xs font-medium text-white">
          <WifiOff className="h-3.5 w-3.5" aria-hidden /> Vous êtes hors ligne : les contenus déjà enregistrés restent consultables, votre progression sera synchronisée au retour du réseau.
        </div>
      )}
      {installEvent && !dismissed && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-soft sm:bottom-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-white">
            <Download className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <div className="font-semibold text-navy">Installer l'application</div>
            <div className="text-muted">Accès rapide depuis votre écran d'accueil, même en connexion faible.</div>
          </div>
          <button
            className="rounded-lg bg-navy px-3 py-2 text-sm font-medium text-white"
            onClick={async () => {
              await installEvent.prompt();
              setInstallEvent(null);
            }}
          >
            Installer
          </button>
          <button
            aria-label="Fermer"
            className="text-muted"
            onClick={() => {
              setDismissed(true);
              try {
                localStorage.setItem("nga_install_dismissed", "1");
              } catch {}
            }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
