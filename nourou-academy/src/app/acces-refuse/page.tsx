import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { buttonClass } from "@/components/ui";

export default function Forbidden() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <ShieldAlert className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
        <h1 className="mt-4 text-2xl font-bold text-navy">Accès refusé</h1>
        <p className="mt-2 text-muted">Vous n'avez pas les droits nécessaires pour consulter cette page.</p>
        <Link href="/" className={buttonClass("primary", "md", "mt-6")}>Retour à l'accueil</Link>
      </div>
    </main>
  );
}
