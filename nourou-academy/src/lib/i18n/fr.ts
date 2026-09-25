/** Dictionnaire français (langue principale). Ajouter une langue = créer un fichier avec les mêmes clés. */
export const fr = {
  "nav.courses": "Formations",
  "nav.trainers": "Formateurs",
  "nav.tutor": "Tuteur IA",
  "nav.pricing": "Tarifs",
  "nav.resources": "Ressources",
  "nav.contact": "Contact",
  "nav.login": "Connexion",
  "nav.register": "S'inscrire",
  "nav.startFree": "Commencer gratuitement",
  "nav.mySpace": "Mon espace",
  "cta.buy": "Acheter cette formation",
  "cta.talkToTutor": "Parler à mon tuteur IA",
} as const;

export type MessageKey = keyof typeof fr;
