'use client';
import { Eye, EyeOff, Server } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { apiBase, ApiError, setApiBase } from '@/lib/api';
import { Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [serverOpen, setServerOpen] = useState(false);
  const [server, setServer] = useState('');

  useEffect(() => { setServer(apiBase()); }, []);
  useEffect(() => { if (!loading && user) router.replace(user.mustChangePassword ? '/mon-compte/' : user.permissions.includes('*') || user.permissions.includes('dashboard.view') ? '/' : '/rendez-vous/'); }, [loading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-royal-black md:flex-row">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6 md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,0.25),transparent_60%)]" />
        <img src="/logo-1024.jpg" alt="DREAD ROYAL — African Hair & Dreadlocks Studio" className="relative w-56 max-w-full rounded-3xl shadow-[0_0_60px_rgba(212,175,55,0.35)] sm:w-72 md:w-[26rem]" />
      </div>
      <div className="flex flex-1 items-center justify-center bg-gradient-to-b from-royal-ink to-royal-black p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-royal-gold/25 bg-white p-6 shadow-2xl">
          <div>
            <h1 className="font-display text-2xl font-bold">Connexion</h1>
            <p className="text-sm text-neutral-500">DREAD ROYAL Management System</p>
          </div>
          <Field label="Identifiant"><Input autoComplete="username" autoCapitalize="none" value={username} onChange={(e) => setU(e.target.value)} required autoFocus /></Field>
          <Field label="Mot de passe">
            <div className="relative">
              <Input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} required className="pr-10" />
              <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-2 text-neutral-400" aria-label="Afficher le mot de passe">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
          </Field>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>Se connecter</Button>
          <div className="border-t pt-3">
            <button type="button" onClick={() => setServerOpen(!serverOpen)} className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-800"><Server className="h-3.5 w-3.5" />Adresse du serveur</button>
            {serverOpen && (
              <div className="mt-2 flex gap-2">
                <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="https://api.dreadroyal.bf/api" className="text-xs" />
                <Button type="button" size="sm" variant="dark" onClick={() => { setApiBase(server || null); setServer(apiBase()); }}>OK</Button>
              </div>
            )}
          </div>
          <p className="text-center text-xs italic text-royal-gold-dark">« Votre couronne, votre identité. »</p>
        </form>
      </div>
    </div>
  );
}
