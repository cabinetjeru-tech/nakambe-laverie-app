'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { DriverProfile } from '@/lib/driver-runtime';
import { dateOnly } from '@/lib/format';
import { PhotoInput } from './photo-input';
import { Badge, Button, Select } from './ui';

export const DOCUMENT_LABELS: Record<string, string> = {
  CNIB: 'Carte d’identité (CNIB)',
  PERMIS: 'Permis de conduire',
  CARTE_GRISE: 'Carte grise',
  ASSURANCE: 'Assurance',
  PHOTO: 'Photo d’identité',
  CASIER_JUDICIAIRE: 'Casier judiciaire',
  AUTRE: 'Autre document',
};
const DOC_STATUS: Record<string, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  PENDING: { label: 'En vérification', tone: 'amber' },
  APPROVED: { label: 'Validé', tone: 'green' },
  REJECTED: { label: 'Refusé', tone: 'red' },
};
export const REQUIRED_DOCUMENTS = ['CNIB', 'PERMIS', 'CARTE_GRISE', 'PHOTO'];

export function DriverDocuments({ profile, onChange }: { profile: DriverProfile; onChange: () => void }) {
  const [type, setType] = useState(REQUIRED_DOCUMENTS.find((t) => !profile.documents.some((d) => d.type === t)) ?? 'AUTRE');
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {REQUIRED_DOCUMENTS.map((t) => {
          const doc = profile.documents.find((d) => d.type === t);
          return (
            <li key={t} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span>
                {DOCUMENT_LABELS[t]}
                {doc?.rejectionReason && <span className="block text-xs text-red-600">{doc.rejectionReason}</span>}
              </span>
              {doc ? <Badge tone={DOC_STATUS[doc.status].tone}>{DOC_STATUS[doc.status].label}</Badge> : <Badge tone="gray">À envoyer</Badge>}
            </li>
          );
        })}
        {profile.documents
          .filter((d) => !REQUIRED_DOCUMENTS.includes(d.type))
          .map((d) => (
            <li key={d.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span>
                {DOCUMENT_LABELS[d.type]} <span className="text-xs text-slate-400">· {dateOnly(d.createdAt)}</span>
              </span>
              <Badge tone={DOC_STATUS[d.status].tone}>{DOC_STATUS[d.status].label}</Badge>
            </li>
          ))}
      </ul>
      <div className="space-y-2 rounded-xl border border-dashed border-slate-300 p-3">
        <p className="text-sm font-semibold text-brand">Envoyer un document</p>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(DOCUMENT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <PhotoInput key={resetKey} purpose="DRIVER_DOCUMENT" label="Photographier le document" onUploaded={setFileKey} accept="image/*,application/pdf" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button
          block
          disabled={!fileKey}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api('/driver/documents', { body: { type, fileKey } });
              setFileKey(null);
              setResetKey((k) => k + 1);
              onChange();
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Envoyer ce document
        </Button>
      </div>
    </div>
  );
}
