import Link from "next/link";
import { requirePermission } from "@/lib/auth/session";
import { getAiSettings, getBrand, getPaymentSettings, getTechnicalSettings, secretStatuses, type SecretKey } from "@/lib/settings";
import { env } from "@/lib/env";
import { saveAiSettingsAction, saveBrandAction, savePaymentSettingsAction, saveTechnicalSettingsAction, testAiAction, testEmailAction } from "@/app/actions/admin";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { FileUploader } from "@/components/forms/file-uploader";
import { Alert, Card, CardBody, Checkbox, Field, Input, PageHeader, Select } from "@/components/ui";

export const metadata = { title: "Paramètres" };
const tabs = [["marque", "Identité & contact"], ["ia", "Intelligence artificielle"], ["paiements", "Paiements"], ["technique", "Technique, emails & visio"]] as const;

function SecretField({ k, label, statuses, hint }: { k: SecretKey; label: string; statuses: Awaited<ReturnType<typeof secretStatuses>>; hint?: string }) {
  const s = statuses[k];
  return (
    <div className="rounded-lg border border-line p-3">
      <Field label={label} hint={s.configured ? `Configurée (${s.source === "env" ? "variable d'environnement" : "administration"}) : ${s.masked}. Laissez vide pour conserver.` : hint ?? "Non configurée."}>
        <Input name={`secret:${k}`} type="password" autoComplete="off" placeholder={s.configured ? "•••••• (inchangée)" : "Coller la clé"} />
      </Field>
      {s.source === "admin" && <div className="mt-2"><Checkbox name={`clear:${k}`} label="Supprimer cette clé" /></div>}
    </div>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ onglet?: string }> }) {
  const { onglet = "marque" } = await searchParams;
  await requirePermission("settings.manage");
  const [brand, ai, pay, tech, secrets] = await Promise.all([getBrand(), getAiSettings(), getPaymentSettings(), getTechnicalSettings(), secretStatuses()]);
  return (
    <>
      <PageHeader title="Paramètres" subtitle="Les clés secrètes sont chiffrées (AES-256-GCM) et ne sont jamais renvoyées au navigateur." />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map(([k, l]) => <Link key={k} href={`?onglet=${k}`} className={`whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium ${onglet === k ? "border-navy text-navy" : "border-transparent text-muted"}`}>{l}</Link>)}
      </nav>

      {onglet === "marque" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card><CardBody>
            <ActionForm action={saveBrandAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom de la plateforme"><Input name="name" defaultValue={brand.name} required /></Field>
                <Field label="Nom court (application)"><Input name="shortName" defaultValue={brand.shortName} /></Field>
                <Field label="Slogan"><Input name="slogan" defaultValue={brand.slogan} /></Field>
                <Field label="Promoteur"><Input name="promoter" defaultValue={brand.promoter} /></Field>
                <Field label="Nom du tuteur IA"><Input name="tutorName" defaultValue={brand.tutorName} /></Field>
                <Field label="URL du logo" hint="Téléversez-le à droite puis collez l'adresse obtenue."><Input name="logoUrl" defaultValue={brand.logoUrl ?? ""} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Couleur principale (bleu marine)"><Input name="primaryColor" type="color" defaultValue={brand.primaryColor} className="h-10 p-1" /></Field>
                <Field label="Couleur secondaire (bleu clair)"><Input name="secondaryColor" type="color" defaultValue={brand.secondaryColor} className="h-10 p-1" /></Field>
                <Field label="Couleur d'accent"><Input name="accentColor" type="color" defaultValue={brand.accentColor} className="h-10 p-1" /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Email de contact"><Input name="email" type="email" defaultValue={brand.email} required /></Field>
                <Field label="Téléphone"><Input name="phone" defaultValue={brand.phone} /></Field>
                <Field label="WhatsApp (format international)"><Input name="whatsapp" defaultValue={brand.whatsapp} placeholder="+226…" /></Field>
                <Field label="Adresse"><Input name="address" defaultValue={brand.address} /></Field>
                <Field label="Facebook"><Input name="facebook" defaultValue={brand.facebook} /></Field>
                <Field label="LinkedIn"><Input name="linkedin" defaultValue={brand.linkedin} /></Field>
                <Field label="Signataire des certificats"><Input name="certificateSignatory" defaultValue={brand.certificateSignatory} /></Field>
                <Field label="Fonction du signataire"><Input name="certificateSignatoryTitle" defaultValue={brand.certificateSignatoryTitle} /></Field>
              </div>
              <SubmitButton>Enregistrer l'identité</SubmitButton>
            </ActionForm>
          </CardBody></Card>
          <Card><CardBody className="space-y-2">
            <div className="text-sm font-semibold text-navy">Logo</div>
            {brand.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt="Logo actuel" className="h-16 w-auto" />
            )}
            <FileUploader showUrl params={{ purpose: "brand-logo" }} accept="image/png,image/webp,image/jpeg" label="Téléverser un logo" hint="PNG transparent conseillé, 2 Mo max. Copiez ensuite l'adresse affichée dans le champ « URL du logo »." />
            <p className="text-xs text-muted">Les icônes de l'application installable se trouvent dans public/icons (voir la documentation).</p>
          </CardBody></Card>
        </div>
      )}

      {onglet === "ia" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <Card><CardBody>
            <ActionForm action={saveAiSettingsAction} className="space-y-4">
              <Field label="Fournisseur principal pour le tuteur, la correction et le générateur">
                <Select name="provider" defaultValue={ai.provider}><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option></Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Modèle Anthropic"><Input name="anthropicModel" defaultValue={ai.anthropicModel} /></Field>
                <Field label="Effort de raisonnement (Anthropic)" hint="« medium » : bon équilibre qualité / coût pour le tutorat."><Select name="anthropicEffort" defaultValue={ai.anthropicEffort}><option value="low">Faible (rapide, économique)</option><option value="medium">Moyen</option><option value="high">Élevé</option></Select></Field>
                <Field label="Modèle OpenAI (conversation)"><Input name="openaiModel" defaultValue={ai.openaiModel} /></Field>
                <Field label="Modèle d'embeddings (OpenAI, 1536 dimensions)"><Input name="embeddingModel" defaultValue={ai.embeddingModel} /></Field>
                <Field label="Transcription vocale (OpenAI)"><Input name="sttModel" defaultValue={ai.sttModel} /></Field>
                <Field label="Synthèse vocale (OpenAI)"><Input name="ttsModel" defaultValue={ai.ttsModel} /></Field>
                <Field label="Voix de synthèse"><Input name="ttsVoice" defaultValue={ai.ttsVoice} /></Field>
                <Field label="Messages de contexte conservés"><Input name="maxContextMessages" type="number" min={2} max={40} defaultValue={ai.maxContextMessages} /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Quota apprenant (requêtes / jour)" hint="0 = illimité"><Input name="learnerDailyMessages" type="number" min={0} defaultValue={ai.learnerDailyMessages} /></Field>
                <Field label="Quota formateur (générations / jour)"><Input name="trainerDailyGenerations" type="number" min={0} defaultValue={ai.trainerDailyGenerations} /></Field>
                <Field label="Budget mensuel global (tokens)" hint="0 = illimité"><Input name="monthlyTokenBudget" type="number" min={0} defaultValue={ai.monthlyTokenBudget} /></Field>
              </div>
              <SecretField k="ai.anthropicKey" label="Clé API Anthropic" statuses={secrets} hint="console.anthropic.com → API Keys" />
              <SecretField k="ai.openaiKey" label="Clé API OpenAI" statuses={secrets} hint="Active la recherche sémantique, la transcription et la synthèse vocales côté serveur." />
              <SubmitButton>Enregistrer</SubmitButton>
            </ActionForm>
          </CardBody></Card>
          <Card><CardBody className="space-y-3 text-sm">
            <div className="font-semibold text-navy">Tester la connexion</div>
            <ActionForm action={async () => { "use server"; return testAiAction(); }}><SubmitButton variant="outline" size="sm">Lancer le test</SubmitButton></ActionForm>
            <p className="text-xs text-muted">Sans clé OpenAI : le RAG fonctionne en recherche plein texte, et la voix utilise les capacités du navigateur quand elles existent.</p>
          </CardBody></Card>
        </div>
      )}

      {onglet === "paiements" && (
        <Card><CardBody>
          {env.paymentDemoEnabled && <Alert tone="warning" className="mb-4">Mode démonstration actif (PAYMENT_DEMO_ENABLED, environnement « {env.appEnv} »). Il est automatiquement désactivé lorsque APP_ENV=production.</Alert>}
          <Alert tone="info" className="mb-4">Vérifiez auprès de chaque prestataire la disponibilité des moyens de paiement (Orange Money, Moov Money, Wave, cartes) dans votre pays et l'éligibilité de votre compte marchand. URL de notification à déclarer : <code className="font-mono">{env.appUrl}/api/payments/webhook/&lt;prestataire&gt;</code></Alert>
          <ActionForm action={savePaymentSettingsAction} className="space-y-6">
            <section className="space-y-3">
              <Checkbox name="enable:cinetpay" defaultChecked={pay.enabled.includes("cinetpay")} label={<b>Activer CinetPay (Mobile Money + cartes)</b>} />
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Site ID"><Input name="cinetpaySiteId" defaultValue={pay.cinetpaySiteId} /></Field>
                <SecretField k="payments.cinetpay.apiKey" label="API Key" statuses={secrets} />
                <SecretField k="payments.cinetpay.secretKey" label="Clé secrète (signature x-token)" statuses={secrets} />
              </div>
            </section>
            <section className="space-y-3">
              <Checkbox name="enable:paydunya" defaultChecked={pay.enabled.includes("paydunya")} label={<b>Activer PayDunya</b>} />
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Mode"><Select name="paydunyaMode" defaultValue={pay.paydunyaMode}><option value="test">Test (sandbox)</option><option value="live">Production</option></Select></Field>
                <Field label="Nom de la boutique"><Input name="paydunyaStoreName" defaultValue={pay.paydunyaStoreName} /></Field>
                <SecretField k="payments.paydunya.masterKey" label="Master Key" statuses={secrets} />
                <SecretField k="payments.paydunya.privateKey" label="Private Key" statuses={secrets} />
                <SecretField k="payments.paydunya.token" label="Token" statuses={secrets} />
              </div>
            </section>
            <section className="space-y-3">
              <Checkbox name="enable:wave" defaultChecked={pay.enabled.includes("wave")} label={<b>Activer Wave (API Checkout)</b>} />
              <div className="grid gap-3 md:grid-cols-2">
                <SecretField k="payments.wave.apiKey" label="Clé API Wave" statuses={secrets} />
                <SecretField k="payments.wave.webhookSecret" label="Secret de signature des webhooks" statuses={secrets} />
              </div>
            </section>
            <SubmitButton>Enregistrer les paiements</SubmitButton>
          </ActionForm>
        </CardBody></Card>
      )}

      {onglet === "technique" && (
        <Card><CardBody>
          <ActionForm action={saveTechnicalSettingsAction} className="space-y-6">
            <section className="grid gap-4 md:grid-cols-3">
              <Checkbox name="registrationsOpen" defaultChecked={tech.registrationsOpen} label="Inscriptions ouvertes" />
              <Field label="Taille max. des fichiers (Mo)" hint="Vidéos : jusqu'à 1 Go."><Input name="maxUploadMb" type="number" min={1} defaultValue={tech.maxUploadMb} /></Field>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-navy">Emails (SMTP)</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Serveur"><Input name="smtpHost" defaultValue={tech.smtpHost} placeholder="smtp.exemple.com" /></Field>
                <Field label="Port"><Input name="smtpPort" type="number" defaultValue={tech.smtpPort} /></Field>
                <Field label="Utilisateur"><Input name="smtpUser" defaultValue={tech.smtpUser} /></Field>
                <Field label="Expéditeur"><Input name="smtpFrom" defaultValue={tech.smtpFrom} placeholder="Nourou Academy <no-reply@…>" /></Field>
                <div className="pt-6"><Checkbox name="smtpSecure" defaultChecked={tech.smtpSecure} label="TLS direct (port 465)" /></div>
                <SecretField k="smtp.password" label="Mot de passe SMTP" statuses={secrets} />
              </div>
            </section>
            <section>
              <h3 className="mb-2 font-semibold text-navy">Visioconférence (Jitsi Meet)</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Domaine Jitsi" hint="meet.jit.si (public) ou votre serveur / 8x8.vc"><Input name="jitsiDomain" defaultValue={tech.jitsiDomain} /></Field>
                <Field label="App ID (authentification JWT)"><Input name="jitsiAppId" defaultValue={tech.jitsiAppId} /></Field>
                <SecretField k="live.jitsiAppSecret" label="Secret JWT Jitsi" statuses={secrets} />
              </div>
            </section>
            <SubmitButton>Enregistrer</SubmitButton>
          </ActionForm>
          <ActionForm action={async () => { "use server"; return testEmailAction(); }} className="mt-4"><SubmitButton variant="outline" size="sm">M'envoyer un email de test</SubmitButton></ActionForm>
        </CardBody></Card>
      )}
    </>
  );
}
