import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <div className="text-6xl font-extrabold text-sky">404</div>
        <h1 className="mt-2 text-2xl font-bold text-navy">Page introuvable</h1>
        <p className="mt-2 text-muted">Cette page n'existe pas ou n'est plus disponible.</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/" className={buttonClass("primary")}>Accueil</Link>
          <Link href="/formations" className={buttonClass("outline")}>Formations</Link>
        </div>
      </div>
    </main>
  );
}
