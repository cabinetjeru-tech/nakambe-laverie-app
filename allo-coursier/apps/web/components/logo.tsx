import clsx from 'clsx';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={clsx('h-9 w-9', className)} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#0B2A5B" />
      <g fill="#2F80ED">
        <rect x="56" y="186" width="118" height="24" rx="12" />
        <rect x="86" y="238" width="88" height="24" rx="12" />
        <rect x="56" y="290" width="118" height="24" rx="12" />
      </g>
      <path d="M302 96a132 132 0 0 1 132 132c0 98-132 206-132 206S170 326 170 228A132 132 0 0 1 302 96z" fill="#fff" />
      <circle cx="302" cy="228" r="52" fill="#1DB954" />
    </svg>
  );
}

export function Logo({ light, tagline, suffix }: { light?: boolean; tagline?: boolean; suffix?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="leading-tight">
        <span className={clsx('block text-[17px] font-extrabold tracking-tight', light ? 'text-white' : 'text-brand')}>
          ALLÔ-COURSIER{suffix && <span className="ml-1.5 rounded bg-brand-green px-1.5 py-0.5 align-middle text-[10px] font-bold text-white">{suffix}</span>}
        </span>
        {tagline && <span className={clsx('block text-[11px] font-medium', light ? 'text-blue-200' : 'text-slate-500')}>Livraison • Courses • Services</span>}
      </span>
    </span>
  );
}
