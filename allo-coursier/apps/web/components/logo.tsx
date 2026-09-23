import clsx from 'clsx';

/** Emblème officiel (A + C + livreur). Sur fond sombre, il est posé sur une pastille blanche. */
export function LogoMark({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx('inline-flex shrink-0 items-center justify-center', light && 'rounded-xl bg-white px-1.5 py-1 shadow-sm', className)}>
      <img src="/brand/logo-mark.webp" alt="" width={240} height={139} className="h-8 w-auto" />
    </span>
  );
}

/** Logo complet (emblème + « ALLÔ-COURSIER » + « Agence de livraison et de courses »), sur fond clair. */
export function FullLogo({ className }: { className?: string }) {
  return <img src="/brand/logo.webp" alt="Allô-Coursier — agence de livraison et de courses" width={480} height={257} className={clsx('h-auto', className)} />;
}

export function Logo({ light, tagline, suffix }: { light?: boolean; tagline?: boolean; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark light={light} />
      <span className="leading-tight">
        <span className={clsx('block text-[17px] font-extrabold tracking-tight', light ? 'text-white' : 'text-brand')}>
          ALLÔ-COURSIER{suffix && <span className="ml-1.5 rounded bg-brand-orange px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">{suffix}</span>}
        </span>
        {tagline && <span className={clsx('block text-[11px] font-medium', light ? 'text-blue-200' : 'text-slate-500')}>Livraison • Courses • Services</span>}
      </span>
    </span>
  );
}
