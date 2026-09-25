import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { changePasswordAction } from "@/app/actions/auth";
import { deleteAccountAction, updateProfileAction } from "@/app/actions/account";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardBody, Checkbox, Field, Input, PageHeader, Select, Textarea, buttonClass } from "@/components/ui";
import { formatDate, roleLabels } from "@/lib/format";

export const metadata = { title: "Profil et données personnelles" };

export default async function ProfilePage() {
  const session = await requireUser();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.id } });
  const isTrainer = user.role !== "LEARNER";
  return (
    <>
      <PageHeader title="Mon profil" subtitle={`${roleLabels[user.role]} · membre depuis le ${formatDate(user.createdAt)}`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardBody>
            <h2 className="font-semibold text-navy">Informations et préférences</h2>
            <ActionForm action={updateProfileAction} className="mt-4 space-y-4">
              <Field label="Nom complet"><Input name="name" defaultValue={user.name} required /></Field>
              <Field label="Email" hint="Pour modifier votre email, contactez l'assistance."><Input value={user.email} disabled readOnly /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Téléphone"><Input name="phone" defaultValue={user.phone ?? ""} type="tel" /></Field>
                <Field label="Ville"><Input name="city" defaultValue={user.city ?? ""} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pays">
                  <Select name="country" defaultValue={user.country ?? "BF"}>
                    {[["BF", "Burkina Faso"], ["BJ", "Bénin"], ["CI", "Côte d'Ivoire"], ["SN", "Sénégal"], ["ML", "Mali"], ["NE", "Niger"], ["TG", "Togo"], ["GN", "Guinée"], ["CM", "Cameroun"], ["FR", "France"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </Field>
                <Field label="Mon niveau (pour le tuteur IA)">
                  <Select name="level" defaultValue={user.level}>
                    <option value="BEGINNER">Débutant</option>
                    <option value="INTERMEDIATE">Intermédiaire</option>
                    <option value="ADVANCED">Avancé</option>
                  </Select>
                </Field>
              </div>
              {isTrainer && (
                <>
                  <Field label="Titre professionnel (public)"><Input name="headline" defaultValue={user.headline ?? ""} maxLength={160} /></Field>
                  <Field label="Biographie (publique)"><Textarea name="bio" defaultValue={user.bio ?? ""} rows={5} maxLength={3000} /></Field>
                </>
              )}
              <Checkbox name="lowDataMode" defaultChecked={user.lowDataMode} label={<><b>Mode faible consommation de données</b> — vidéos chargées uniquement à la demande, images décoratives masquées, visioconférence en qualité réduite.</>} />
              <Checkbox name="marketingConsent" defaultChecked={user.marketingConsent} label="Recevoir les nouveautés et offres de l'académie." />
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardBody>
              <h2 className="font-semibold text-navy">Mot de passe</h2>
              <ActionForm action={changePasswordAction} className="mt-4 space-y-3" resetOnSuccess>
                <Field label="Mot de passe actuel"><Input name="current" type="password" autoComplete="current-password" required /></Field>
                <Field label="Nouveau mot de passe"><Input name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
                <SubmitButton variant="outline">Modifier</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h2 className="font-semibold text-navy">Mes données personnelles</h2>
              <p className="mt-1 text-sm text-muted">
                Consentement donné le {formatDate(user.privacyConsentAt)}. Vous pouvez télécharger une copie de vos données (profil, inscriptions, progression,
                résultats, conversations avec le tuteur, paiements) au format JSON.
              </p>
              <a href="/api/compte/export" className={buttonClass("outline", "md", "mt-3")}>Télécharger mes données</a>
            </CardBody>
          </Card>
          <Card className="border-red-200">
            <CardBody>
              <h2 className="font-semibold text-red-700">Supprimer mon compte</h2>
              <p className="mt-1 text-sm text-muted">
                Vos données personnelles, notes, conversations et messages seront effacés et votre compte anonymisé. Les factures sont conservées de façon anonymisée
                pendant la durée légale. Cette action est irréversible.
              </p>
              <ActionForm action={deleteAccountAction} className="mt-3 space-y-3">
                <Field label="Mot de passe"><Input name="password" type="password" required /></Field>
                <Field label="Tapez SUPPRIMER pour confirmer"><Input name="confirm" required pattern="SUPPRIMER" /></Field>
                <SubmitButton variant="danger" confirm="Supprimer définitivement votre compte ?">Supprimer définitivement</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
