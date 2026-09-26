"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Download, Share } from "lucide-react";
import type { InstallWindow } from "./pwa-register";

type State = "loading" | "installed" | "ready" | "ios" | "manual";

/** Bouton d'installation : invitation native sur Android / ordinateur, consignes sur iPhone. */
export function InstallApp({ name }: { name: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const refresh = () => {
      if (standalone) return setState("installed");
      if ((window as InstallWindow).ngaInstallPrompt) return setState("ready");
      setState(ios ? "ios" : "manual");
    };
    const onInstalled = () => setState("installed");
    refresh();
    window.addEventListener("nga-install-ready", refresh);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("nga-install-ready", refresh);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    const w = window as InstallWindow;
    const prompt = w.ngaInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice.catch(() => ({ outcome: "dismissed" }));
    w.ngaInstallPrompt = null;
    setState(choice.outcome === "accepted" ? "installed" : "manual");
  }

  return (
    <div className="mx-auto mt-6 max-w-md text-center" aria-live="polite">
      {state === "ready" && (
        <button onClick={install} className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3 text-base font-semibold text-navy shadow-soft">
          <Download className="h-5 w-5" aria-hidden /> Installer l'application
        </button>
      )}
      {state === "installed" && (
        <p className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-5 w-5" aria-hidden /> {name} est installée sur cet appareil.
        </p>
      )}
      {state === "ios" && (
        <p className="inline-flex items-center gap-2 rounded-xl bg-sky-50 px-4 py-3 text-sm text-navy">
          <Share className="h-5 w-5 shrink-0 text-sky" aria-hidden /> Dans Safari : bouton Partager › « Sur l'écran d'accueil ».
        </p>
      )}
      {state === "manual" && (
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-navy">
          Suivez les étapes ci-dessous pour votre appareil. Sur Android, ouvrez ce lien avec Chrome.
        </p>
      )}
    </div>
  );
}
