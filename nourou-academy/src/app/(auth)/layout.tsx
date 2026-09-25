import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getBrand } from "@/lib/settings";
import { Logo } from "@/components/layout/logo";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-4 py-6 sm:px-10">
        <Logo name={brand.name} logoUrl={brand.logoUrl} />
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</main>
        <p className="text-center text-xs text-muted">
          <Link href="/confidentialite" className="hover:underline">Confidentialité</Link> · <Link href="/conditions" className="hover:underline">Conditions</Link> · <Link href="/contact" className="hover:underline">Assistance</Link>
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-center lg:p-16">
        <div className="hero-grid decorative absolute inset-0" aria-hidden />
        <div className="relative">
          <Sparkles className="h-10 w-10 text-accent" aria-hidden />
          <h2 className="mt-6 text-3xl font-extrabold leading-tight">{brand.slogan}</h2>
          <p className="mt-4 max-w-md text-slate-200">
            Formations professionnelles, classes virtuelles et {brand.tutorName}, votre tuteur IA personnel — disponibles sur votre téléphone, même en connexion limitée.
          </p>
        </div>
      </div>
    </div>
  );
}
