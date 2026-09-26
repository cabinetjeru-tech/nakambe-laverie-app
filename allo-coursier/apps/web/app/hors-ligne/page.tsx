import { WifiOff } from 'lucide-react';

export const metadata = { title: 'Hors connexion' };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-brand px-6 text-center text-white">
      <WifiOff className="h-12 w-12 text-blue-200" />
      <h1 className="text-xl font-bold">Pas de connexion Internet</h1>
      <p className="max-w-sm text-blue-100">
        Cette page n’est pas encore disponible hors connexion. Vérifiez votre réseau puis réessayez : vos informations seront à jour dès le retour du réseau.
      </p>
      <a href="/" className="mt-2 rounded-xl bg-white px-5 py-2.5 font-semibold text-brand">Réessayer</a>
    </main>
  );
}
