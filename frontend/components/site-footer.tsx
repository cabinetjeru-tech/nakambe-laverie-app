import Link from 'next/link';
import { COMPANY, BRANCHES, EXPANSION_COUNTRIES } from '@/lib/constants';
import { whatsappLink } from '@/lib/format';

export function SiteFooter() {
  return (
    <footer id="contact" className="mt-16 border-t border-slate-200 bg-brand-blue-dark text-white">
      <div className="mx-auto max-w-6xl px-4 pt-10 pb-28 sm:pb-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="text-xl font-extrabold">{COMPANY.name}</div>
            <div className="text-sm text-brand-gold">{COMPANY.slogan}</div>
            <div className="mt-1 text-xs text-slate-300">{COMPANY.parentCompany}</div>
            <div className="mt-3 flex flex-col gap-0.5 text-xs text-slate-400">
              <span>RCCM N° : en cours</span>
              <span>IFU N° : en cours</span>
              <span>CNSS N° : en cours</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Siège social</div>
            <p className="text-sm text-slate-200">
              {COMPANY.headOffice.city} — {COMPANY.headOffice.district}
            </p>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <a href={`tel:${COMPANY.headOffice.phone.replace(/\s/g, '')}`} className="hover:text-brand-gold">
                📞 {COMPANY.headOffice.phone}
              </a>
              <a href={`tel:${COMPANY.phone1.replace(/\s/g, '')}`} className="hover:text-brand-gold">
                📞 {COMPANY.phone1}
              </a>
              <a href={`tel:${COMPANY.phone2.replace(/\s/g, '')}`} className="hover:text-brand-gold">
                📞 {COMPANY.phone2}
              </a>
              <a
                href={whatsappLink(COMPANY.whatsapp, `Bonjour ${COMPANY.name}, je souhaite avoir des informations.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-gold"
              >
                💬 Contacter sur WhatsApp
              </a>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Nos agences</div>
            <ul className="flex flex-col gap-2 text-sm text-slate-200">
              {BRANCHES.map((branch) => (
                <li key={branch.city}>
                  <span className="font-semibold text-white">📍 {branch.city}</span>
                  <span className="block text-xs text-slate-400">{branch.detail}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Horaires</div>
            <p className="text-sm text-slate-200">Lundi - Samedi : 7h30 - 19h00</p>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-6 text-center">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Notre expansion en Afrique — bientôt disponible
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {EXPANSION_COUNTRIES.map((country) => (
              <span key={country} className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-200">
                {country}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-2 text-center text-xs text-slate-400 sm:flex-row sm:justify-between">
          <p>
            © {new Date().getFullYear()} {COMPANY.fullName} — Tous droits réservés.
          </p>
          <div className="flex gap-4">
            <Link href="/politique-remboursement" className="underline hover:text-brand-gold">
              Politique de remboursement
            </Link>
            <Link href="/politique-confidentialite" className="underline hover:text-brand-gold">
              Politique de confidentialité
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
