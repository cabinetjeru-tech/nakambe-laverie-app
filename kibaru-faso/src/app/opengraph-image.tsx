import { imageApercu, TAILLE_APERCU } from "@/lib/image-apercu";

export const alt = "PÉDAGOGUE.IA — l'assistant pédagogique des enseignants du Burkina Faso";
export const size = TAILLE_APERCU;
export const contentType = "image/png";

/** Image d'aperçu des liens partagés (WhatsApp, Facebook, TikTok). */
export default function Image() {
  return imageApercu();
}
