import type { Metadata } from "next";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions/auth";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-navy">Mot de passe oublié</h1>
      <p className="mt-1 text-sm text-muted">Indiquez votre email : nous vous enverrons un lien pour choisir un nouveau mot de passe.</p>
      <ActionForm action={forgotPasswordAction} className="mt-8 space-y-4">
        <Field label="Adresse email"><Input name="email" type="email" autoComplete="email" required /></Field>
        <SubmitButton size="lg" className="w-full">Envoyer le lien</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-center text-sm"><Link href="/connexion" className="font-medium text-sky hover:underline">← Retour à la connexion</Link></p>
    </>
  );
}
