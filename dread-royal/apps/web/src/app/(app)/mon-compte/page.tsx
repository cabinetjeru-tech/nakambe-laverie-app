'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, Field, Input, PageHeader, useUi } from '@/components/ui';
import { post } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export default function MonComptePage() {
  const { user, reload } = useAuth();
  const { toast } = useUi();
  const router = useRouter();
  const [cur, setCur] = useState('');
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [busy, setBusy] = useState(false);
  const strong = pwd.length >= 8 && /[A-Za-z]/.test(pwd) && /\d/.test(pwd);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post('/auth/change-password', { currentPassword: cur, newPassword: pwd });
      toast('success', 'Mot de passe modifié. Vos autres appareils ont été déconnectés.');
      await reload();
      router.replace('/');
    } catch (err: any) { toast('error', err.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHeader title="Mon compte" subtitle={user ? `${user.fullName} · ${user.role.name} · identifiant ${user.username}` : undefined} />
      {user?.mustChangePassword && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Pour votre sécurité, choisissez un mot de passe personnel avant de continuer.</div>}
      <Card title="Changer mon mot de passe" className="max-w-lg">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Mot de passe actuel"><Input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
          <Field label="Nouveau mot de passe" hint="8 caractères minimum, avec des lettres et des chiffres"><Input type="password" autoComplete="new-password" value={pwd} onChange={(e) => setPwd(e.target.value)} required /></Field>
          <Field label="Confirmation"><Input type="password" autoComplete="new-password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} required /></Field>
          {pwd2 && pwd !== pwd2 && <p className="text-xs text-red-600">Les mots de passe ne correspondent pas.</p>}
          <Button type="submit" loading={busy} disabled={!strong || pwd !== pwd2 || !cur}>Enregistrer</Button>
        </form>
      </Card>
    </>
  );
}
