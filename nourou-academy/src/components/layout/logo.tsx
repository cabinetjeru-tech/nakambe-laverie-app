import Link from "next/link";
import clsx from "clsx";

/** Icône Akambi Academy : le « a » orange coiffé de la toque (public/brand). */
export function LogoMark({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/akambi-mark.png" alt="" className={clsx("shrink-0 object-contain", className)} />;
}

/**
 * Logo officiel (logotype « Akambi Academy »). Version blanche sur fond sombre.
 * Si un logo personnalisé est défini dans Paramètres › Identité, il est utilisé à la place.
 */
export function Logo({ name, logoUrl, href = "/", light = false }: { name: string; logoUrl?: string | null; href?: string; light?: boolean }) {
  return (
    <Link href={href} className="flex items-center" aria-label={`${name} — accueil`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl || (light ? "/brand/akambi-logo-blanc.png" : "/brand/akambi-logo.png")}
        alt={name}
        width={125}
        height={40}
        className="h-10 w-auto"
      />
    </Link>
  );
}
