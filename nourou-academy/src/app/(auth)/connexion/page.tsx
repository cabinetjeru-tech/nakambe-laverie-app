import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { homeFor } from "@/lib/permissions";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ suivant?: string }> }) {
  const { suivant } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Bon retour parmi nous</h1>
      <p className="mt-1 text-sm text-muted">Connectez-vous pour reprendre vos formations.</p>
      <ActionForm action={loginAction} className="mt-8 space-y-4">
        <input type="hidden" name="suivant" value={suivant ?? ""} />
        <Field label="Adresse email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Mot de passe"><Input name="password" type="password" autoComplete="current-password" required /></Field>
        <div className="text-right text-sm"><Link href="/mot-de-passe-oublie" className="font-medium text-sky hover:underline">Mot de passe oublié ?</Link></div>
        <SubmitButton size="lg" className="w-full" pendingText="Connexion…">Se connecter</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Pas encore de compte ? <Link href={`/inscription${suivant ? `?suivant=${encodeURIComponent(suivant)}` : ""}`} className="font-semibold text-sky hover:underline">Inscrivez-vous gratuitement</Link>
      </p>
    </>
  );
}
