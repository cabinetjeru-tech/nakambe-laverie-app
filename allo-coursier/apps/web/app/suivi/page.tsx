import Link from 'next/link';
import { Logo } from '@/components/logo';

export const metadata = { title: 'Suivre un colis' };

export default function TrackingHelpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 px-5 py-8">
      <Link href="/">
        <Logo tagline />
      </Link>
      <h1 className="text-2xl font-bold text-brand">Suivre un colis</h1>
      <p className="text-slate-600">
        Ouvrez le lien de suivi que l’expéditeur vous a envoyé (par WhatsApp ou SMS). Il affiche la position du livreur en direct.
      </p>
      <p className="text-slate-600">
        Le jour de la livraison, gardez le <strong>code à 4 chiffres</strong> reçu avec le lien : le livreur vous le demandera pour vous remettre le colis.
      </p>
      <Link href="/commandes" className="font-semibold text-brand-light">Vous êtes l’expéditeur ? Voir mes commandes →</Link>
    </main>
  );
}
