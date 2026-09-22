import clsx from 'clsx';
import { timeOnly } from '@/lib/format';

export function Timeline({ items }: { items: { status: string; label: string; at: string; note?: string | null }[] }) {
  return (
    <ol className="relative ml-2 border-l-2 border-slate-200">
      {items.map((h, i) => {
        const last = i === items.length - 1;
        return (
          <li key={`${h.status}-${h.at}-${i}`} className="mb-3 ml-4 last:mb-0">
            <span className={clsx('absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ring-4 ring-white', last ? 'bg-brand-green' : 'bg-brand-light')} />
            <p className={clsx('text-sm', last ? 'font-semibold text-slate-900' : 'text-slate-600')}>
              {h.label} <span className="ml-1 text-xs font-normal text-slate-400">{timeOnly(h.at)}</span>
            </p>
            {h.note && <p className="text-xs text-slate-500">{h.note}</p>}
          </li>
        );
      })}
    </ol>
  );
}
