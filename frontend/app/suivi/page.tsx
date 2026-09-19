'use client';

import { useState } from 'react';
import axios from 'axios';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ORDER_STATUS_LABELS, ORDER_STATUS_SEQUENCE, SERVICE_DOMAIN_LABELS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface TrackResult {
  orderNumber: string;
  status: string;
  domain: string;
  expectedReadyAt: string | null;
  createdAt: string;
  statusHistory: { status: string; createdAt: string; comment: string | null }[];
}

export default function SuiviPage() {
  const [orderNumber, setOrderNumber] = useState('');
  const [result, setResult] = useState<TrackResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const { data } = await axios.get<TrackResult>(`${API_URL}/orders/track/${encodeURIComponent(orderNumber.trim())}`);
      setResult(data);
    } catch {
      setError("Aucune commande trouvée avec ce numéro. Vérifiez qu'il est bien écrit (ex : NK-2026-000001).");
    } finally {
      setLoading(false);
    }
  }

  const currentIndex = result ? ORDER_STATUS_SEQUENCE.indexOf(result.status) : -1;

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 py-14">
        <h1 className="text-2xl font-bold text-brand-blue">Suivre ma commande</h1>
        <p className="mt-1 text-sm text-slate-500">Entrez le numéro de commande indiqué sur votre reçu (ex : NK-2026-000001).</p>

        <form onSubmit={handleSubmit} className="card mt-6 flex flex-col gap-3 sm:flex-row">
          <input
            className="input flex-1"
            placeholder="NK-2026-000001"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            required
          />
          <button type="submit" disabled={loading} className="btn-primary disabled:opacity-60">
            {loading ? 'Recherche...' : 'Suivre'}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        {result && (
          <div className="card mt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-bold text-brand-blue">{result.orderNumber}</div>
                <div className="text-sm text-slate-500">{SERVICE_DOMAIN_LABELS[result.domain] ?? result.domain}</div>
              </div>
              <span className="badge bg-brand-gold-light text-brand-blue-dark">
                {ORDER_STATUS_LABELS[result.status] ?? result.status}
              </span>
            </div>

            <ol className="mt-6 space-y-3">
              {ORDER_STATUS_SEQUENCE.map((status, idx) => {
                const done = currentIndex >= 0 && idx <= currentIndex;
                const historyEntry = result.statusHistory.find((h) => h.status === status);
                return (
                  <li key={status} className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        done ? 'bg-brand-blue text-white' : 'bg-slate-200 text-slate-400'
                      }`}
                    >
                      {done ? '✓' : ''}
                    </span>
                    <div>
                      <div className={`text-sm font-medium ${done ? 'text-slate-800' : 'text-slate-400'}`}>
                        {ORDER_STATUS_LABELS[status]}
                      </div>
                      {historyEntry && (
                        <div className="text-xs text-slate-400">{formatDateTime(historyEntry.createdAt)}</div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
