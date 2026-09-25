import type { Metadata } from "next";
import Link from "next/link";
import { resetPasswordAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Nouveau mot de passe" };

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Choisissez un nouveau mot de passe</h1>
      <ActionForm action={resetPasswordAction} className="mt-8 space-y-4">
        <input type="hidden" name="token" value={token} />
        <Field label="Nouveau mot de passe" hint="8 caractères minimum, avec au moins une lettre et un chiffre."><Input name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
        <Field label="Confirmation"><Input name="confirm" type="password" autoComplete="new-password" required minLength={8} /></Field>
        <SubmitButton size="lg" className="w-full">Enregistrer</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/connexion" className="font-medium text-sky hover:underline">Aller à la connexion</Link></p>
    </>
  );
}
