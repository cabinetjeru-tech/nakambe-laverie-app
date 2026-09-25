import type { Metadata } from "next";
import { OfflineLibrary } from "@/components/learn/offline-library";

export const metadata: Metadata = { title: "Contenus hors ligne" };

export default function OfflinePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-bold text-navy">Mes contenus hors ligne</h1>
      <p className="mt-1 text-muted">Les supports enregistrés sur cet appareil restent consultables sans connexion. Le tuteur IA, les vidéos en streaming et les paiements nécessitent Internet.</p>
      <OfflineLibrary />
    </div>
  );
}
