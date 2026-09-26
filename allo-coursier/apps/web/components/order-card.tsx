import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { dateTime, fcfa, SERVICE_LABELS, STATUS_LABELS } from '@/lib/format';
import { StatusBadge } from './ui';

export interface OrderSummary {
  id: string;
  reference: string;
  status: string;
  serviceType: string;
  totalAmount: number;
  createdAt: string;
  scheduledAt: string | null;
  stops: { kind: string; landmark: string }[];
}

export function OrderCard({ order, href }: { order: OrderSummary; href: string }) {
  const pickup = order.stops.find((s) => s.kind === 'PICKUP');
  const dropoff = order.stops.find((s) => s.kind === 'DROPOFF');
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-card transition hover:ring-1 hover:ring-brand-light/40">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-brand">{SERVICE_LABELS[order.serviceType]}</span>
          <StatusBadge status={order.status} label={STATUS_LABELS[order.status] ?? order.status} />
        </div>
        <p className="mt-1 truncate text-sm text-slate-700">
          <span className="font-semibold text-brand-light">A</span> {pickup?.landmark}
        </p>
        <p className="truncate text-sm text-slate-700">
          <span className="font-semibold text-brand-green">B</span> {dropoff?.landmark}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {order.reference} · {dateTime(order.scheduledAt ?? order.createdAt)} · {fcfa(order.totalAmount)}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
    </Link>
  );
}
