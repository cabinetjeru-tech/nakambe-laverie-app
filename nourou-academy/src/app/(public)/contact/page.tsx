import type { Metadata } from "next";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { getBrand } from "@/lib/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { contactAction } from "@/app/actions/support";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardBody, Field, Input, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Contact et assistance" };

export default async function ContactPage() {
  const [brand, user] = await Promise.all([getBrand(), getCurrentUser()]);
  const wa = brand.whatsapp.replace(/[^0-9]/g, "");
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 sm:px-6 lg:grid-cols-[1fr_1.3fr]">
      <div>
        <h1 className="text-3xl font-bold text-navy">Contact et assistance</h1>
        <p className="mt-2 text-muted">Une question sur une formation, un paiement ou votre compte ? Écrivez-nous : chaque demande reçoit un numéro de suivi.</p>
        <ul className="mt-8 space-y-4 text-sm">
          <li className="flex gap-3"><MapPin className="h-5 w-5 text-sky" aria-hidden />{brand.address}</li>
          <li className="flex gap-3"><Phone className="h-5 w-5 text-sky" aria-hidden /><a href={`tel:${brand.phone.replace(/\s/g, "")}`}>{brand.phone}</a></li>
          <li className="flex gap-3"><Mail className="h-5 w-5 text-sky" aria-hidden /><a href={`mailto:${brand.email}`}>{brand.email}</a></li>
          {wa && <li className="flex gap-3"><MessageCircle className="h-5 w-5 text-emerald-600" aria-hidden /><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a></li>}
        </ul>
      </div>
      <Card>
        <CardBody>
          <ActionForm action={contactAction} className="space-y-4" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nom"><Input name="name" defaultValue={user?.name} required /></Field>
              <Field label="Email"><Input name="email" type="email" defaultValue={user?.email} required /></Field>
            </div>
            <Field label="Téléphone (facultatif)"><Input name="phone" type="tel" defaultValue={user?.phone ?? ""} /></Field>
            <Field label="Objet"><Input name="subject" required maxLength={150} /></Field>
            <Field label="Message"><Textarea name="message" rows={6} required maxLength={5000} /></Field>
            <div className="hidden" aria-hidden><label>Site web<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <SubmitButton>Envoyer</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
