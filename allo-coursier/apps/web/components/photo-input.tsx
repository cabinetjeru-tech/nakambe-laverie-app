'use client';

import { Camera, Check } from 'lucide-react';
import { useRef, useState } from 'react';
import { uploadPhoto } from '@/lib/api';
import { compressImage } from '@/lib/image';
import { Button } from './ui';

/** Prise de photo (appareil photo du téléphone), compressée puis envoyée ; renvoie la clé du fichier. */
export function PhotoInput({ purpose, label, onUploaded, accept = 'image/*', capture = true }: { purpose: string; label: string; onUploaded: (key: string | null) => void; accept?: string; capture?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const blob = file.type === 'application/pdf' ? file : await compressImage(file);
      const res = await uploadPhoto(purpose, blob, file.type === 'application/pdf' ? 'document.pdf' : 'photo.jpg');
      setPreview(file.type === 'application/pdf' ? null : URL.createObjectURL(blob));
      onUploaded(res.key);
    } catch (err) {
      setError((err as Error).message);
      onUploaded(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <input ref={input} type="file" accept={accept} {...(capture ? { capture: 'environment' as const } : {})} className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="flex items-center gap-3">
        {preview && <img src={preview} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />}
        <Button type="button" variant={preview ? 'secondary' : 'outline'} onClick={() => input.current?.click()} loading={busy}>
          {preview ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
          {preview ? 'Photo envoyée — reprendre' : label}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
