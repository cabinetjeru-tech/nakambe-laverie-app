export const COMPANY = {
  name: 'NOUVELLE LAVERIE AFRICAINE',
  fullName: 'NOUVELLE LAVERIE AFRICAINE',
  shortName: 'Laverie',
  slogan: 'Laverie express et digitale',
  tagline: 'Un simple coup de fil, nous voici !',
  parentCompany: 'Une marque du Groupe Akambi SARL',
  headOffice: { city: 'Ouagadougou', district: 'Somgandé', phone: '+226 58 58 00 00' },
  phone1: '+226 73 12 26 12',
  phone2: '+226 54 54 28 18',
  whatsapp: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '22673122612',
};

export const BRANCHES = [
  { city: 'Tenkodogo', detail: 'Secteur 6, Cité du 11 Décembre' },
  { city: 'Bagré', detail: 'Non loin du centre universitaire' },
  { city: "Fada N'Gourma", detail: 'Secteur 2, route du Niger' },
  { city: 'Koudougou', detail: 'Centre universitaire' },
];

/** Pays d'expansion visés — pas encore d'agences opérationnelles, adresses à venir. */
export const EXPANSION_COUNTRIES = [
  { name: 'Bénin', flag: '🇧🇯' },
  { name: "Côte d'Ivoire", flag: '🇨🇮' },
  { name: 'Ghana', flag: '🇬🇭' },
  { name: 'Mali', flag: '🇲🇱' },
  { name: 'Niger', flag: '🇳🇪' },
  { name: 'Sénégal', flag: '🇸🇳' },
  { name: 'Togo', flag: '🇹🇬' },
];

export const ORDER_STATUS_LABELS: Record<string, string> = {
  DEMANDE_RECUE: 'Demande reçue',
  RDV_CONFIRME: 'Rendez-vous confirmé',
  COLLECTE_PROGRAMMEE: 'Collecte programmée',
  COLLECTE_EFFECTUEE: 'Collecté',
  RECEPTIONNE: 'Réceptionné',
  TRI: 'Tri',
  LAVAGE: 'Lavage',
  ESSORAGE: 'Essorage',
  SECHAGE: 'Séchage',
  REPASSAGE: 'Repassage',
  CONTROLE_QUALITE: 'Contrôle qualité',
  EMBALLAGE: 'Emballage',
  PRET: 'Prêt',
  LIVRAISON_PROGRAMMEE: 'Livraison programmée',
  LIVRE: 'Livré',
  TERMINE: 'Terminé',
  ANNULE: 'Annulé',
};

export const ORDER_STATUS_SEQUENCE = [
  'DEMANDE_RECUE',
  'RDV_CONFIRME',
  'COLLECTE_PROGRAMMEE',
  'COLLECTE_EFFECTUEE',
  'RECEPTIONNE',
  'TRI',
  'LAVAGE',
  'ESSORAGE',
  'SECHAGE',
  'REPASSAGE',
  'CONTROLE_QUALITE',
  'EMBALLAGE',
  'PRET',
  'LIVRAISON_PROGRAMMEE',
  'LIVRE',
  'TERMINE',
];

export const SERVICE_DOMAIN_LABELS: Record<string, string> = {
  LAVERIE_PRESSING: 'Laverie & Pressing',
  AUTO_MOTO: 'Lavage auto/moto',
  TEXTILE_MAISON: 'Tapis, moquettes, divans, matelas',
  CHANTIER: 'Nettoyage de chantier',
  MOBILE: 'Intervention mobile',
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  NOUVELLE: 'Nouvelle',
  EN_COURS: 'En cours de traitement',
  TRAITEE: 'Traitée',
  CLOTUREE: 'Clôturée',
};

export const PAYMENT_TIMING_LABELS: Record<string, string> = {
  AVANT_PRESTATION: 'Paiement avant la prestation',
  APRES_PRESTATION: 'Paiement après la prestation',
};

export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  DEMANDE: 'Demande envoyée',
  CONFIRME: 'Confirmé',
  REPROGRAMME: 'Reprogrammé',
  ANNULE: 'Annulé',
  CONVERTI: 'Converti en commande',
};

export const CLIENT_TYPE_LABELS: Record<string, string> = {
  PARTICULIER: 'Particulier',
  ENTREPRISE: 'Entreprise',
  ADMINISTRATION: 'Administration',
  HOTEL: 'Hôtel',
  RESTAURANT: 'Restaurant',
  AUTRE: 'Autre',
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  GERANT: 'Gérant',
  RECEPTIONNISTE: 'Réceptionniste',
  AGENT_LAVERIE: 'Agent laverie',
  AGENT_NETTOYAGE: 'Agent nettoyage',
  CHAUFFEUR: 'Chauffeur / Livreur',
  CLIENT: 'Client',
};
