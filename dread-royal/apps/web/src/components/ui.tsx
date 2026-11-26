'use client';
import clsx from 'clsx';
import { Loader2, X } from 'lucide-react';
import { createContext, forwardRef, useCallback, useContext, useEffect, useState } from 'react';

// ───────────── Boutons & champs ─────────────
type BtnVariant = 'gold' | 'dark' | 'outline' | 'ghost' | 'danger' | 'success';
export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' | 'lg'; icon?: React.ReactNode }>(
  ({ variant = 'gold', loading, size = 'md', icon, className, children, disabled, ...p }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-royal-gold/60 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap',
        size === 'sm' && 'px-2.5 py-1.5 text-xs',
        size === 'md' && 'px-4 py-2 text-sm',
        size === 'lg' && 'px-5 py-3 text-base',
        variant === 'gold' && 'bg-gradient-to-b from-[#E2C15A] to-royal-gold-dark text-royal-black shadow hover:brightness-105',
        variant === 'dark' && 'bg-royal-black text-royal-gold hover:bg-royal-coal',
        variant === 'outline' && 'border border-neutral-300 bg-white text-neutral-800 hover:bg-neutral-50',
        variant === 'ghost' && 'text-neutral-700 hover:bg-neutral-100',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700',
        variant === 'success' && 'bg-emerald-600 text-white hover:bg-emerald-700',
        className,
      )}
      {...p}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

const fieldCls = 'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 shadow-sm placeholder:text-neutral-400 focus:border-royal-gold focus:outline-none focus:ring-2 focus:ring-royal-gold/30 disabled:bg-neutral-100';
/** Largeur pleine par défaut, sauf si une largeur explicite (w-…) est fournie. */
const widthCls = (className?: string) => (className && /(^|\s)w-/.test(className) ? '' : 'w-full');
export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={clsx(fieldCls, widthCls(className), className)} {...p} />);
Input.displayName = 'Input';
export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => <select ref={ref} className={clsx(fieldCls, widthCls(className), 'pr-8', className)} {...p} />);
Select.displayName = 'Select';
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => <textarea ref={ref} rows={3} className={clsx(fieldCls, 'w-full', className)} {...p} />);
Textarea.displayName = 'Textarea';

export function Field({ label, children, hint, required, className }: { label: string; children: React.ReactNode; hint?: string; required?: boolean; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-neutral-600">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

/** Champ montant FCFA (entier). */
export function MoneyInput({ value, onChange, ...p }: { value: number | ''; onChange: (v: number | '') => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <div className="relative">
      <Input inputMode="numeric" value={value === '' ? '' : String(value)} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); onChange(v === '' ? '' : Number(v)); }} className="pr-14 text-right font-medium" {...p} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-neutral-500">FCFA</span>
    </div>
  );
}

// ───────────── Mise en page ─────────────
export function Card({ children, className, title, actions }: { children: React.ReactNode; className?: string; title?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <section className={clsx('rounded-xl border border-neutral-200 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-800">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold text-royal-black md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-neutral-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, hint, icon, tone = 'default', onClick }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; tone?: 'default' | 'gold' | 'dark' | 'red' | 'green'; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={clsx('relative overflow-hidden rounded-xl border p-4 shadow-card', onClick && 'cursor-pointer hover:ring-2 hover:ring-royal-gold/40',
      tone === 'dark' ? 'border-royal-coal bg-royal-black text-white' : tone === 'gold' ? 'border-royal-gold/40 bg-gradient-to-br from-royal-gold-light to-white' : 'border-neutral-200 bg-white',
    )}>
      <div className="flex items-start justify-between gap-2">
        <p className={clsx('text-xs font-semibold uppercase tracking-wide', tone === 'dark' ? 'text-royal-gold' : 'text-neutral-500')}>{label}</p>
        {icon && <span className={clsx('rounded-lg p-1.5', tone === 'dark' ? 'bg-royal-coal text-royal-gold' : 'bg-royal-gold-light text-royal-gold-dark')}>{icon}</span>}
      </div>
      <p className={clsx('mt-2 text-xl font-bold md:text-2xl', tone === 'red' && 'text-red-600', tone === 'green' && 'text-emerald-700')}>{value}</p>
      {hint && <p className={clsx('mt-1 text-xs', tone === 'dark' ? 'text-neutral-400' : 'text-neutral-500')}>{hint}</p>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  gray: 'bg-neutral-100 text-neutral-700', gold: 'bg-royal-gold-light text-royal-gold-dark', green: 'bg-emerald-100 text-emerald-800', red: 'bg-red-100 text-red-700',
  orange: 'bg-amber-100 text-amber-800', blue: 'bg-sky-100 text-sky-800', purple: 'bg-violet-100 text-violet-800', dark: 'bg-royal-black text-royal-gold',
};
export function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: keyof typeof badgeTones | string }) {
  return <span className={clsx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold', badgeTones[tone] ?? badgeTones.gray)}>{children}</span>;
}

export function Spinner({ label = 'Chargement…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500"><Loader2 className="h-5 w-5 animate-spin text-royal-gold" />{label}</div>;
}

export function Empty({ children = 'Aucune donnée.' }: { children?: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-500">{children}</div>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <span>{error}</span>
      {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Réessayer</Button>}
    </div>
  );
}

export interface Column<T> { key: string; label: React.ReactNode; render?: (row: T) => React.ReactNode; className?: string; align?: 'left' | 'right' | 'center' }
export function Table<T extends { id?: string }>({ columns, rows, onRowClick, empty, footer, rowClassName }: { columns: Column<T>[]; rows: T[]; onRowClick?: (r: T) => void; empty?: React.ReactNode; footer?: React.ReactNode; rowClassName?: (r: T) => string | undefined }) {
  if (!rows.length) return <Empty>{empty ?? 'Aucun élément.'}</Empty>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={clsx('sticky top-0 border-b-2 border-royal-gold/50 bg-royal-black px-3 py-2 text-xs font-semibold uppercase tracking-wide text-royal-gold first:rounded-tl-lg last:rounded-tr-lg', c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left')}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} onClick={onRowClick ? () => onRowClick(r) : undefined} className={clsx('even:bg-neutral-50', onRowClick && 'cursor-pointer hover:bg-royal-gold-light/60', rowClassName?.(r))}>
              {columns.map((c) => (
                <td key={c.key} className={clsx('border-b border-neutral-100 px-3 py-2 align-middle', c.align === 'right' && 'text-right tabular-nums', c.align === 'center' && 'text-center', c.className)}>{c.render ? c.render(r) : (r as any)[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: { key: K; label: React.ReactNode }[]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-neutral-200/70 p-1">
      {tabs.map((t) => (
        <button key={t.key} onClick={() => onChange(t.key)} className={clsx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition', value === t.key ? 'bg-royal-black text-royal-gold shadow' : 'text-neutral-700 hover:bg-white/70')}>{t.label}</button>
      ))}
    </div>
  );
}

// ───────────── Fenêtres ─────────────
export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx('flex max-h-[95vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', size === 'sm' && 'sm:max-w-md', size === 'md' && 'sm:max-w-xl', size === 'lg' && 'sm:max-w-3xl', size === 'xl' && 'sm:max-w-5xl')}>
        <div className="flex items-center justify-between rounded-t-2xl border-b border-royal-gold/30 bg-royal-black px-5 py-3">
          <h3 className="font-display text-lg font-bold text-royal-gold">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-royal-coal hover:text-white" aria-label="Fermer"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

// ───────────── Notifications & confirmations ─────────────
interface Toast { id: number; type: 'success' | 'error' | 'info' | 'warning'; text: string }
interface ConfirmOpts { title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean; reasonLabel?: string; reasonRequired?: boolean }
interface UiCtx { toast: (type: Toast['type'], text: string) => void; confirm: (o: ConfirmOpts) => Promise<{ ok: boolean; reason?: string }> }
const UiContext = createContext<UiCtx>(null as any);
export const useUi = () => useContext(UiContext);

export function UiProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirm] = useState<(ConfirmOpts & { resolve: (r: { ok: boolean; reason?: string }) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const toast = useCallback((type: Toast['type'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 7000 : 4000);
  }, []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<{ ok: boolean; reason?: string }>((resolve) => { setReason(''); setConfirm({ ...o, resolve }); }), []);
  const close = (ok: boolean) => { confirmState?.resolve({ ok, reason: reason.trim() || undefined }); setConfirm(null); };
  return (
    <UiContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((t) => (
          <div key={t.id} className={clsx('pointer-events-auto rounded-lg border-l-4 bg-white px-4 py-3 text-sm shadow-xl', t.type === 'success' && 'border-emerald-500', t.type === 'error' && 'border-red-500', t.type === 'info' && 'border-royal-gold', t.type === 'warning' && 'border-amber-500')}>{t.text}</div>
        ))}
      </div>
      <Modal open={!!confirmState} onClose={() => close(false)} title={confirmState?.title ?? ''} size="sm"
        footer={<><Button variant="outline" onClick={() => close(false)}>Annuler</Button><Button variant={confirmState?.danger ? 'danger' : 'gold'} disabled={!!confirmState?.reasonRequired && reason.trim().length < 3} onClick={() => close(true)}>{confirmState?.confirmLabel ?? 'Confirmer'}</Button></>}>
        <div className="space-y-3 text-sm text-neutral-700">
          <div>{confirmState?.message}</div>
          {confirmState?.reasonLabel && <Field label={confirmState.reasonLabel} required={confirmState.reasonRequired}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field>}
        </div>
      </Modal>
    </UiContext.Provider>
  );
}
