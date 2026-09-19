import { COMPANY } from '@/lib/constants';
import { whatsappLink } from '@/lib/format';

export function SiteFooter() {
  return (
    <footer id="contact" className="mt-16 border-t border-slate-200 bg-brand-blue-dark text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="text-xl font-extrabold">{COMPANY.name}</div>
            <div className="text-sm text-brand-gold">{COMPANY.slogan}</div>
            <p className="mt-3 text-sm text-slate-200">{COMPANY.address}</p>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Nous contacter</div>
            <div className="flex flex-col gap-2 text-sm">
              <a href={`tel:${COMPANY.phone1.replace(/\s/g, '')}`} className="hover:text-brand-gold">
                📞 {COMPANY.phone1}
              </a>
              <a href={`tel:${COMPANY.phone2.replace(/\s/g, '')}`} className="hover:text-brand-gold">
                📞 {COMPANY.phone2}
              </a>
              <a
                href={whatsappLink(COMPANY.whatsapp, 'Bonjour Nakambé, je souhaite avoir des informations.')}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-gold"
              >
                💬 Contacter sur WhatsApp
              </a>
            </div>
          </div>
          <div>
            <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-300">Horaires</div>
            <p className="text-sm text-slate-200">Lundi - Samedi : 7h30 - 19h00</p>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {COMPANY.fullName} — Tous droits réservés.
        </p>
      </div>
    </footer>
  );
}
