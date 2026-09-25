import Link from "next/link";
import clsx from "clsx";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={clsx("shrink-0", className)} aria-hidden>
      <rect width="48" height="48" rx="12" fill="var(--brand-primary)" />
      <path d="M13 35V13h4.2l13.6 15.6V13H35v22h-4.2L17.2 19.4V35z" fill="#fff" />
      <circle cx="37.5" cy="10.5" r="4" fill="var(--brand-accent)" />
    </svg>
  );
}

export function Logo({ name, logoUrl, href = "/", light = false }: { name: string; logoUrl?: string | null; href?: string; light?: boolean }) {
  const [first, ...rest] = name.split(" ");
  return (
    <Link href={href} className="flex items-center gap-2.5" aria-label={`${name} — accueil`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-9 w-auto" />
      ) : (
        <LogoMark className="h-9 w-9" />
      )}
      <span className={clsx("leading-none", light ? "text-white" : "text-navy")}>
        <span className="block text-[15px] font-extrabold tracking-tight">{first}</span>
        <span className={clsx("block text-[10px] font-semibold uppercase tracking-[0.18em]", light ? "text-sky-200" : "text-sky")}>{rest.join(" ")}</span>
      </span>
    </Link>
  );
}
