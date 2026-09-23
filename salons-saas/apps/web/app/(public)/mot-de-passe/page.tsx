'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { Button, ErrorMessage, Field, Input } from '@/components/ui';
import { post } from '@/lib/api';

export default function PasswordPage() {
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  async function run(action: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-stone-900">Mot de passe modifié</h1>
        <p className="text-sm text-stone-600">Vos autres appareils ont été déconnectés par sécurité.</p>
        <Link href="/connexion" className="block text-center text-sm font-medium text-brand-700 hover:underline">
          Se connecter
        </Link>
      </div>
    );
  }

  return step === 'request' ? (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        run(async () => {
          await post('/auth/password/forgot', { phone });
          setStep('reset');
        });
      }}
      className="space-y-4"
    >
      <h1 className="text-xl font-semibold text-stone-900">Mot de passe oublié</h1>
      <p className="text-sm text-stone-600">Nous envoyons un code à 6 chiffres à votre numéro.</p>
      <Field label="Téléphone">{(id) => <Input id={id} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" required />}</Field>
      <ErrorMessage error={error} />
      <Button type="submit" loading={loading} className="w-full">
        Recevoir un code
      </Button>
      <Link href="/connexion" className="block text-center text-sm text-brand-700 hover:underline">
        Retour à la connexion
      </Link>
    </form>
  ) : (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        run(async () => {
          await post('/auth/password/reset', { phone, code, newPassword: password });
          setStep('done');
        });
      }}
      className="space-y-4"
    >
      <h1 className="text-xl font-semibold text-stone-900">Nouveau mot de passe</h1>
      <p className="text-sm text-stone-600">Si ce numéro a un compte, un code vient d’être envoyé (valable 15 minutes).</p>
      <Field label="Code reçu">
        {(id) => <Input id={id} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required pattern="\d{6}" />}
      </Field>
      <Field label="Nouveau mot de passe" hint="8 caractères minimum">
        {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />}
      </Field>
      <ErrorMessage error={error} />
      <Button type="submit" loading={loading} className="w-full">
        Changer le mot de passe
      </Button>
    </form>
  );
}
