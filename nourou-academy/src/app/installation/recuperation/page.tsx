import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { KeyRound } from "lucide-react";
import { recoverAdminAction } from "@/app/actions/setup";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, Card, CardBody, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Récupération administrateur", robots: { index: false } };
export const dynamic = "force-dynamic";

export default function RecoveryPage() {
  // Invisible tant que ADMIN_RECOVERY_TOKEN n'est pas défini chez l'hébergeur.
  if ((process.env.ADMIN_RECOVERY_TOKEN ?? "").length < 16) notFound();
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardBody className="space-y-5">
          <div className="text-center">
            <KeyRound className="mx-auto h-10 w-10 text-accent" aria-hidden />
            <h1 className="mt-3 text-2xl font-bold text-navy">Récupération du compte administrateur</h1>
            <p className="mt-1 text-sm text-muted">Définissez un nouveau mot de passe pour le super-administrateur.</p>
          </div>
          <Alert tone="warning">Après usage, supprimez la variable <code>ADMIN_RECOVERY_TOKEN</code> chez votre hébergeur puis redéployez : cette page disparaîtra.</Alert>
          <ActionForm action={recoverAdminAction} className="space-y-4">
            <Field label="Clé de récupération" hint="La valeur de ADMIN_RECOVERY_TOKEN que vous avez définie."><Input name="token" type="password" required autoComplete="off" /></Field>
            <Field label="Email du super-administrateur"><Input name="email" type="email" required autoComplete="username" /></Field>
            <Field label="Nouveau mot de passe" hint="12 caractères minimum, avec lettres et chiffres."><Input name="password" type="password" required minLength={12} autoComplete="new-password" /></Field>
            <Field label="Confirmez le mot de passe"><Input name="confirm" type="password" required minLength={12} autoComplete="new-password" /></Field>
            <SubmitButton size="lg" className="w-full" pendingText="Enregistrement…">Enregistrer et me connecter</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </main>
  );
}
