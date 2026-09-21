import { COMPANY } from '@/lib/constants';
import { whatsappLink } from '@/lib/format';

/** Bouton WhatsApp Business flottant, visible sur toutes les pages du site public/client. */
export function WhatsAppButton() {
  return (
    <a
      href={whatsappLink(COMPANY.whatsapp, `Bonjour ${COMPANY.name}, je souhaite avoir des informations.`)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Nous contacter sur WhatsApp"
      className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-lg transition hover:scale-105"
    >
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="white" aria-hidden="true">
        <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.34.653 4.53 1.786 6.396L4 29l7.79-1.75A11.94 11.94 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3zm0 21.818a9.78 9.78 0 0 1-4.99-1.363l-.358-.213-4.62 1.038 1.06-4.505-.234-.37A9.77 9.77 0 0 1 5.2 15c0-5.965 4.84-10.818 10.804-10.818S26.808 9.035 26.808 15 21.968 24.818 16.004 24.818zm5.63-7.36c-.31-.155-1.828-.902-2.112-1.005-.283-.104-.49-.155-.696.155-.206.31-.797 1.005-.978 1.212-.18.207-.36.233-.67.078-.31-.155-1.31-.483-2.495-1.54-.922-.822-1.545-1.838-1.726-2.148-.18-.31-.02-.478.136-.632.14-.14.31-.362.464-.543.155-.18.206-.31.31-.517.103-.207.051-.388-.026-.543-.078-.155-.696-1.68-.955-2.3-.252-.605-.508-.523-.696-.533l-.593-.01c-.207 0-.543.078-.827.388-.283.31-1.083 1.06-1.083 2.583s1.109 2.995 1.264 3.202c.155.207 2.184 3.333 5.29 4.674.74.32 1.317.51 1.767.653.742.236 1.418.203 1.953.123.596-.089 1.828-.747 2.086-1.468.257-.72.257-1.34.18-1.468-.077-.129-.283-.207-.593-.362z" />
      </svg>
    </a>
  );
}
