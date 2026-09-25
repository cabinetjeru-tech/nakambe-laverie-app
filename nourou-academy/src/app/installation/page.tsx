import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Rocket } from "lucide-react";
import { prisma } from "@/lib/db";
import { installAction } from "@/app/actions/setup";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Alert, Card, CardBody, Checkbox, Field, Input } from "@/components/ui";

export const metadata: Metadata = { title: "Installation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InstallPage() {
  // Page disponible uniquement tant qu'aucun super-administrateur n'existe.
  if (await prisma.user.count({ where: { role: "SUPERADMIN" } })) notFound();
  const tokenSet = (process.env.SETUP_TOKEN ?? "").length >= 16;
  return (
    <main className="grid min-h-dvh place-items-center bg-surface px-4 py-10">
      <Card className="w-full max-w-lg">
        <CardBody className="space-y-5">
          <div className="text-center">
            <Rocket className="mx-auto h-10 w-10 text-accent" aria-hidden />
            <h1 className="mt-3 text-2xl font-bold text-navy">Installation de la plateforme</h1>
            <p className="mt-1 text-sm text-muted">Créez le compte super-administrateur. Cette page disparaît ensuite définitivement.</p>
          </div>
          {!tokenSet ? (
            <Alert tone="warning">Ajoutez d'abord la variable d'environnement <code>SETUP_TOKEN</code> (16 caractères minimum) dans votre hébergeur, puis redéployez.</Alert>
          ) : (
            <ActionForm action={installAction} className="space-y-4">
              <Field label="Jeton d'installation" hint="La valeur de SETUP_TOKEN définie chez votre hébergeur."><Input name="token" type="password" required autoComplete="off" /></Field>
              <Field label="Votre nom"><Input name="name" required /></Field>
              <Field label="Votre email"><Input name="email" type="email" required /></Field>
              <Field label="Mot de passe" hint="12 caractères minimum, avec lettres et chiffres."><Input name="password" type="password" required minLength={12} autoComplete="new-password" /></Field>
              <Checkbox name="demo" defaultChecked label={<>Charger les <b>données de démonstration</b> (5 formations, formateurs et apprenant fictifs, marqués « démo »). Mot de passe des comptes démo : <code>Demo2026!</code></>} />
              <SubmitButton size="lg" className="w-full" pendingText="Installation en cours…">Installer</SubmitButton>
            </ActionForm>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
