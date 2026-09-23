import clsx from 'clsx';
import { ReactNode } from 'react';

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
}

/** Tableau d'administration : défilement horizontal sur téléphone, ligne cliquable facultative. */
export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty = 'Aucun résultat' }: { rows: T[] | undefined; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl bg-white shadow-card">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((c) => (
              <th key={c.header} className={clsx('px-4 py-3 font-semibold', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows?.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                {empty}
              </td>
            </tr>
          )}
          {!rows && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-400">
                Chargement…
              </td>
            </tr>
          )}
          {rows?.map((r) => (
            <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined} className={clsx('border-b border-slate-50 last:border-0', onRowClick && 'cursor-pointer hover:bg-slate-50')}>
              {columns.map((c) => (
                <td key={c.header} className={clsx('px-4 py-3 align-top', c.className)}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
