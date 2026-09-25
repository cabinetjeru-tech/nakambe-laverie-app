import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { registerAction } from "@/app/actions/auth";
import { getCurrentUser } from "@/lib/auth/session";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Checkbox, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Créer un compte" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ suivant?: string }> }) {
  const { suivant } = await searchParams;
  if (await getCurrentUser()) redirect("/espace");
  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Créez votre compte gratuit</h1>
      <p className="mt-1 text-sm text-muted">Accédez aux formations gratuites et à votre tuteur IA en une minute.</p>
      <ActionForm action={registerAction} className="mt-8 space-y-4">
        <input type="hidden" name="suivant" value={suivant ?? ""} />
        <Field label="Nom complet"><Input name="name" autoComplete="name" required minLength={2} maxLength={100} /></Field>
        <Field label="Adresse email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <Field label="Téléphone (facultatif)" hint="Utile pour le paiement Mobile Money et l'assistance."><Input name="phone" type="tel" autoComplete="tel" placeholder="+226 …" /></Field>
        <Field label="Mot de passe" hint="8 caractères minimum, avec au moins une lettre et un chiffre."><Input name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
        <Checkbox
          name="consent"
          required
          label={<>J'accepte les <Link href="/conditions" className="text-sky underline">conditions d'utilisation</Link> et la <Link href="/confidentialite" className="text-sky underline">politique de confidentialité</Link>.</>}
        />
        <Checkbox name="marketing" label="J'accepte de recevoir les nouveautés et offres de l'académie (facultatif)." />
        <SubmitButton variant="accent" size="lg" className="w-full" pendingText="Création…">Créer mon compte</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm text-muted">
        Déjà inscrit ? <Link href="/connexion" className="font-semibold text-sky hover:underline">Connexion</Link>
      </p>
    </>
  );
}
