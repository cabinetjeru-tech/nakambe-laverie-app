import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { Laptop, Smartphone } from "lucide-react";
import { getBrand } from "@/lib/settings";
import { env } from "@/lib/env";
import { InstallApp } from "@/components/layout/install-app";

export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    title: "Installer l'application",
    description: `Installez ${brand.name} sur votre téléphone ou votre ordinateur : gratuit, léger, sans passer par un magasin d'applications.`,
  };
}

export default async function InstallPage() {
  const brand = await getBrand();
  const link = `${env.appUrl.replace(/\/$/, "")}/application`;
  const qr = await QRCode.toString(link, { type: "svg", margin: 1, color: { dark: "#00123A", light: "#FFFFFF" } });
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="mx-auto h-20 w-20 rounded-2xl shadow-soft" />
        <h1 className="mt-4 text-3xl font-bold text-navy">Installer {brand.name}</h1>
        <p className="mx-auto mt-2 max-w-xl text-muted">
          Gratuite et légère : l'application s'ajoute à votre écran d'accueil sans passer par Play Store ni App Store, et reste
          utilisable avec une connexion faible.
        </p>
      </div>

      <InstallApp name={brand.shortName} />

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy"><Smartphone className="h-5 w-5 text-sky" aria-hidden /> Android</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>Ouvrez ce lien avec <b>Chrome</b>.</li>
            <li>Appuyez sur le bouton <b>« Installer l'application »</b> ci-dessus.</li>
            <li>Sinon : menu <b>⋮</b> en haut à droite › <b>« Installer l'application »</b> ou <b>« Ajouter à l'écran d'accueil »</b>.</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy"><Smartphone className="h-5 w-5 text-sky" aria-hidden /> iPhone / iPad</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>Ouvrez ce lien avec <b>Safari</b>.</li>
            <li>Appuyez sur le bouton <b>Partager</b> (carré avec une flèche vers le haut).</li>
            <li>Choisissez <b>« Sur l'écran d'accueil »</b>, puis <b>« Ajouter »</b>.</li>
          </ol>
        </section>
        <section className="rounded-2xl border border-line bg-white p-6">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy"><Laptop className="h-5 w-5 text-sky" aria-hidden /> Ordinateur</h2>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            <li>Avec <b>Chrome</b> ou <b>Edge</b> : cliquez sur l'icône d'installation à droite de la barre d'adresse.</li>
            <li>Ou utilisez simplement le site dans votre navigateur : tout fonctionne de la même façon.</li>
          </ol>
        </section>
        <section className="flex items-center gap-5 rounded-2xl border border-line bg-white p-6">
          <div className="h-32 w-32 shrink-0" aria-label="QR code vers cette page" dangerouslySetInnerHTML={{ __html: qr }} />
          <div className="text-sm text-slate-700">
            <div className="font-semibold text-navy">Sur un autre appareil ?</div>
            Scannez ce QR code avec l'appareil photo du téléphone, ou partagez le lien :
            <div className="mt-1 break-all font-medium text-sky">{link}</div>
          </div>
        </section>
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Déjà installée ? <Link href="/inscription" className="font-medium text-sky">Créez votre compte</Link> ou{" "}
        <Link href="/connexion" className="font-medium text-sky">connectez-vous</Link>.
      </p>
    </div>
  );
}
