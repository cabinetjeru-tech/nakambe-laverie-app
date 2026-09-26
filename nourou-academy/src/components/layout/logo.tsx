import Link from "next/link";
import clsx from "clsx";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={clsx("shrink-0", className)} aria-hidden>
      {/* « A » en sommet (progression), chevron doré (maîtrise), étincelle (accompagnement IA) */}
      <rect width="48" height="48" rx="12" fill="var(--brand-primary)" />
      <path d="M22.2 8.5h3.6L39 39h-6.9L24 20.6 15.9 39H9z" fill="#fff" />
      <path d="M16.4 34.2 24 27.6l7.6 6.6-2.2 3-5.4-4.7-5.4 4.7z" fill="var(--brand-accent)" />
      <path d="M38.5 5.5c.5 2.6 1.4 3.5 4 4-2.6.5-3.5 1.4-4 4-.5-2.6-1.4-3.5-4-4 2.6-.5 3.5-1.4 4-4z" fill="var(--brand-accent)" />
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
        <span className="block text-[15px] font-extrabold uppercase tracking-[0.06em]">{first}</span>
        <span className={clsx("block text-[10px] font-semibold uppercase tracking-[0.18em]", light ? "text-sky-200" : "text-sky")}>{rest.join(" ")}</span>
      </span>
    </Link>
  );
}
