import Link from "next/link";
import { Mail, MapPin, Phone } from "lucide-react";
import { getBrand } from "@/lib/settings";
import { Logo } from "./logo";

export async function PublicFooter() {
  const brand = await getBrand();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 bg-navy text-slate-200">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-1">
          <Logo name={brand.name} logoUrl={brand.logoUrl} light />
          <p className="mt-4 text-sm text-slate-300">{brand.slogan}</p>
          <p className="mt-2 text-xs text-slate-400">Une initiative de {brand.promoter}.</p>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-white">Apprendre</div>
          <ul className="space-y-2 text-sm">
            <li><Link href="/formations" className="hover:text-white">Catalogue des formations</Link></li>
            <li><Link href="/tuteur-ia" className="hover:text-white">{brand.tutorName}, votre tuteur</Link></li>
            <li><Link href="/tarifs" className="hover:text-white">Tarifs et abonnements</Link></li>
            <li><Link href="/blog" className="hover:text-white">Blog et ressources gratuites</Link></li>
            <li><Link href="/temoignages" className="hover:text-white">Avis des apprenants</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-white">Académie</div>
          <ul className="space-y-2 text-sm">
            <li><Link href="/formateurs" className="hover:text-white">Nos formateurs</Link></li>
            <li><Link href="/verifier-certificat" className="hover:text-white">Vérifier un certificat</Link></li>
            <li><Link href="/faq" className="hover:text-white">Questions fréquentes</Link></li>
            <li><Link href="/contact" className="hover:text-white">Contact et assistance</Link></li>
            <li><Link href="/confidentialite" className="hover:text-white">Confidentialité</Link></li>
            <li><Link href="/conditions" className="hover:text-white">Conditions d'utilisation</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-sm font-semibold text-white">Nous joindre</div>
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" aria-hidden />{brand.address}</li>
            <li className="flex gap-2"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" aria-hidden />{brand.phone}</li>
            <li className="flex gap-2"><Mail className="mt-0.5 h-4 w-4 shrink-0 text-sky-200" aria-hidden /><a href={`mailto:${brand.email}`} className="hover:text-white">{brand.email}</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-400 sm:flex-row sm:justify-between sm:px-6">
          <span>© {year} {brand.name} — {brand.promoter}. Tous droits réservés.</span>
          <span>Les certificats délivrés attestent d'une formation suivie ; ils ne constituent pas des diplômes d'État.</span>
        </div>
      </div>
    </footer>
  );
}
