import Link from "next/link";
import clsx from "clsx";

/** Emblème officiel Akambi Academy (public/brand). Sur fond sombre, il est posé sur une pastille blanche pour rester lisible. */
export function LogoMark({ className, light = false }: { className?: string; light?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src="/brand/akambi-emblem-web.png" alt="" className={clsx("shrink-0 object-contain", light ? "h-full w-full" : className)} />;
  return light ? <span className={clsx("grid shrink-0 place-items-center rounded-xl bg-white p-1", className)}>{img}</span> : img;
}

export function Logo({ name, logoUrl, href = "/", light = false }: { name: string; logoUrl?: string | null; href?: string; light?: boolean }) {
  const [first, ...rest] = name.split(" ");
  return (
    <Link href={href} className="flex items-center gap-2" aria-label={`${name} — accueil`}>
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-9 w-auto" />
      ) : (
        <LogoMark className={light ? "h-11 w-12" : "h-11 w-12"} light={light} />
      )}
      <span className="leading-none">
        <span className={clsx("block text-[17px] font-extrabold uppercase tracking-[0.04em]", light ? "text-white" : "text-[#1747B5]")}>{first}</span>
        <span className="mt-0.5 block text-[10.5px] font-bold uppercase tracking-[0.3em] text-accent">{rest.join(" ")}</span>
      </span>
    </Link>
  );
}
