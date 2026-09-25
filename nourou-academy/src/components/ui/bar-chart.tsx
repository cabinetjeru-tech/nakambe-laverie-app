import { formatXof } from "@/lib/format";

/**
 * Histogramme simple (une seule série, une teinte) + tableau de données accessible.
 * Info-bulle native au survol de chaque barre.
 */
export function RevenueBars({ data, title }: { data: { label: string; total: number; count: number }[]; title: string }) {
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <figure>
      <figcaption className="mb-3 text-sm font-semibold text-navy">{title}</figcaption>
      {data.every((d) => d.total === 0) && <p className="mb-2 text-xs text-muted">Aucun encaissement confirmé sur la période.</p>}
      <div className="flex h-44 items-end gap-1.5 border-b border-line" role="img" aria-label={title}>
        {data.map((d) => (
          <div key={d.label} className="group flex h-full flex-1 flex-col justify-end" title={`${d.label} : ${formatXof(d.total)} (${d.count} paiement(s))`}>
            <div className="rounded-t-[4px] bg-sky transition group-hover:brightness-90" style={{ height: `${Math.max(d.total > 0 ? 2 : 0, (d.total / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-[10px] text-muted">{data.map((d) => <span key={d.label} className="flex-1 text-center">{d.label}</span>)}</div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted">Voir les données</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr className="text-muted"><th className="py-1">Mois</th><th>Montant</th><th>Paiements</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.label} className="border-t border-line"><td className="py-1">{d.label}</td><td>{formatXof(d.total)}</td><td>{d.count}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
