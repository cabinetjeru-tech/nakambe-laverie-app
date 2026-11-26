/**
 * Catalogue initial DREAD ROYAL — tarifs indicatifs d'un salon de standing à Ouagadougou (2026), en FCFA.
 * Mèches, rajouts et produits spécifiques non inclus sauf mention. Tous les tarifs sont modifiables dans l'application.
 * price = tarif de base ; priceMax = tarif maximum selon la longueur / le volume de cheveux.
 */
export const SERVICE_CATEGORIES = [
  { code: 'DRH', name: 'Dreadlocks hommes', sortOrder: 1 },
  { code: 'DRF', name: 'Dreadlocks femmes', sortOrder: 2 },
  { code: 'ENT', name: 'Entretien dreadlocks', sortOrder: 3 },
  { code: 'CAF', name: 'Coiffures africaines femmes', sortOrder: 4 },
  { code: 'COH', name: 'Coupes hommes', sortOrder: 5 },
  { code: 'ENF', name: 'Coiffures enfants', sortOrder: 6 },
  { code: 'SOI', name: 'Soins capillaires', sortOrder: 7 },
];

type S = { code: string; cat: string; name: string; description?: string; price: number; priceMax?: number; duration: number; commission?: number; commissionType?: 'PERCENT' | 'FIXED' };

export const SERVICES: S[] = [
  // Dreadlocks hommes
  { code: 'DRH01', cat: 'DRH', name: 'Départ locks au crochet — cheveux courts', description: 'Création de locks sur cheveux naturels courts (3 à 8 cm)', price: 15000, priceMax: 20000, duration: 240 },
  { code: 'DRH02', cat: 'DRH', name: 'Départ locks au crochet — cheveux mi-longs', description: 'Création de locks sur cheveux naturels de plus de 8 cm', price: 25000, priceMax: 35000, duration: 360 },
  { code: 'DRH03', cat: 'DRH', name: 'Départ locks en vanilles (starter locs)', description: 'Démarrage par twists / vanilles, entretien progressif', price: 7500, priceMax: 10000, duration: 150 },
  { code: 'DRH04', cat: 'DRH', name: 'Locks avec rajouts (extensions)', description: 'Rallongement avec mèches ou cheveux humains (rajouts non inclus)', price: 35000, priceMax: 50000, duration: 420 },
  { code: 'DRH05', cat: 'DRH', name: 'Coiffage locks homme (barrel twist, chignon)', price: 3000, priceMax: 5000, duration: 60 },
  // Dreadlocks femmes
  { code: 'DRF01', cat: 'DRF', name: 'Départ locks naturelles femme', description: 'Création de locks sur cheveux naturels', price: 25000, priceMax: 40000, duration: 360 },
  { code: 'DRF02', cat: 'DRF', name: 'Faux locs / Fausses locks', description: 'Pose de fausses locks au crochet ou enroulées (mèches non incluses)', price: 15000, priceMax: 25000, duration: 300 },
  { code: 'DRF03', cat: 'DRF', name: 'Butterfly locs / Soft locs', description: 'Mèches non incluses', price: 15000, priceMax: 25000, duration: 300 },
  { code: 'DRF04', cat: 'DRF', name: 'Sisterlocks / Microlocks — création', description: 'Micro-locks à l’outil, plusieurs séances possibles', price: 100000, priceMax: 175000, duration: 720 },
  { code: 'DRF05', cat: 'DRF', name: 'Coiffure de locks femme (chignon, tresses de locks)', price: 5000, priceMax: 10000, duration: 75 },
  // Entretien dreadlocks
  { code: 'ENT01', cat: 'ENT', name: 'Retouche racines au crochet — locks courtes', price: 5000, priceMax: 7500, duration: 90 },
  { code: 'ENT02', cat: 'ENT', name: 'Retouche racines au crochet — locks longues', price: 7500, priceMax: 12500, duration: 150 },
  { code: 'ENT03', cat: 'ENT', name: 'Retwist (palm rolling + gel / cire)', price: 5000, priceMax: 7500, duration: 90 },
  { code: 'ENT04', cat: 'ENT', name: 'Lavage détox + soin des locks', description: 'Shampoing clarifiant, rinçage vinaigre de cidre, huile', price: 3000, priceMax: 5000, duration: 45, commission: 20 },
  { code: 'ENT05', cat: 'ENT', name: 'Réparation / raccord de lock (par lock)', price: 1000, duration: 15 },
  { code: 'ENT06', cat: 'ENT', name: 'Resserrage sisterlocks / microlocks', price: 25000, priceMax: 40000, duration: 300 },
  { code: 'ENT07', cat: 'ENT', name: 'Coloration / décoloration des locks', description: 'Produit de coloration non inclus', price: 7500, priceMax: 15000, duration: 120 },
  // Coiffures africaines femmes
  { code: 'CAF01', cat: 'CAF', name: 'Nattes collées simples (sans rajout)', price: 2000, priceMax: 3000, duration: 60 },
  { code: 'CAF02', cat: 'CAF', name: 'Nattes collées avec rajouts (Ghana braids)', description: 'Mèches non incluses', price: 5000, priceMax: 8000, duration: 150 },
  { code: 'CAF03', cat: 'CAF', name: 'Tresses classiques (box braids)', description: 'Mèches non incluses ; prix selon taille et longueur', price: 7500, priceMax: 15000, duration: 300 },
  { code: 'CAF04', cat: 'CAF', name: 'Knotless braids (tresses sans nœud)', description: 'Mèches non incluses', price: 12500, priceMax: 20000, duration: 360 },
  { code: 'CAF05', cat: 'CAF', name: 'Fulani braids', description: 'Mèches et perles non incluses', price: 7500, priceMax: 12500, duration: 240 },
  { code: 'CAF06', cat: 'CAF', name: 'Vanilles / twists avec rajouts', description: 'Mèches non incluses', price: 7500, priceMax: 12500, duration: 240 },
  { code: 'CAF07', cat: 'CAF', name: 'Coiffure au fil (traditionnelle)', price: 2000, priceMax: 3500, duration: 90 },
  { code: 'CAF08', cat: 'CAF', name: 'Tissage cousu (pose de mèches)', description: 'Mèches non incluses', price: 5000, priceMax: 7500, duration: 120 },
  { code: 'CAF09', cat: 'CAF', name: 'Pose de perruque (lace / closure)', price: 3000, priceMax: 7500, duration: 60 },
  { code: 'CAF10', cat: 'CAF', name: 'Crochet braids', description: 'Mèches non incluses', price: 5000, priceMax: 7500, duration: 120 },
  { code: 'CAF11', cat: 'CAF', name: 'Défrisage (produit inclus)', price: 3500, priceMax: 5000, duration: 75 },
  { code: 'CAF12', cat: 'CAF', name: 'Brushing / mise en plis', price: 2000, priceMax: 3000, duration: 45 },
  { code: 'CAF13', cat: 'CAF', name: 'Défaire tresses / démêlage', price: 1500, priceMax: 3000, duration: 60, commission: 20 },
  // Coupes hommes
  { code: 'COH01', cat: 'COH', name: 'Coupe simple (tondeuse)', price: 1000, duration: 20, commission: 40 },
  { code: 'COH02', cat: 'COH', name: 'Coupe dégradée (fade / taper)', price: 1500, priceMax: 2000, duration: 30, commission: 40 },
  { code: 'COH03', cat: 'COH', name: 'Coupe + taille de barbe', price: 2500, duration: 45, commission: 40 },
  { code: 'COH04', cat: 'COH', name: 'Taille de barbe / contours', price: 500, priceMax: 1000, duration: 15, commission: 40 },
  { code: 'COH05', cat: 'COH', name: 'Rasage complet de la tête', price: 1000, duration: 20, commission: 40 },
  { code: 'COH06', cat: 'COH', name: 'Nattes collées homme', price: 3000, priceMax: 5000, duration: 90 },
  { code: 'COH07', cat: 'COH', name: 'Twists courts / éponge (sponge twists)', price: 2000, priceMax: 3000, duration: 45 },
  { code: 'COH08', cat: 'COH', name: 'Teinture homme (coupe non incluse)', price: 2500, priceMax: 4000, duration: 45 },
  { code: 'COH09', cat: 'COH', name: 'Dessin / motif à la tondeuse', price: 500, priceMax: 1500, duration: 15, commission: 40 },
  // Enfants
  { code: 'ENF01', cat: 'ENF', name: 'Coupe enfant garçon (moins de 12 ans)', price: 750, duration: 20, commission: 40 },
  { code: 'ENF02', cat: 'ENF', name: 'Nattes collées fillette (sans rajout)', price: 1500, priceMax: 2500, duration: 60 },
  { code: 'ENF03', cat: 'ENF', name: 'Tresses fillette avec rajouts', description: 'Mèches non incluses', price: 4000, priceMax: 7500, duration: 180 },
  { code: 'ENF04', cat: 'ENF', name: 'Coiffure au fil fillette', price: 1000, priceMax: 1500, duration: 60 },
  { code: 'ENF05', cat: 'ENF', name: 'Vanilles / twists enfant', price: 2500, priceMax: 4000, duration: 90 },
  { code: 'ENF06', cat: 'ENF', name: 'Départ locks enfant', price: 10000, priceMax: 15000, duration: 180 },
  { code: 'ENF07', cat: 'ENF', name: 'Retouche locks enfant', price: 3000, priceMax: 5000, duration: 60 },
  // Soins
  { code: 'SOI01', cat: 'SOI', name: 'Shampoing + démêlage', price: 1500, priceMax: 2000, duration: 30, commission: 20 },
  { code: 'SOI02', cat: 'SOI', name: "Bain d'huile (karité, ricin)", price: 2500, priceMax: 3500, duration: 45, commission: 20 },
  { code: 'SOI03', cat: 'SOI', name: 'Soin profond à la vapeur', price: 5000, duration: 60, commission: 20 },
  { code: 'SOI04', cat: 'SOI', name: 'Soin du cuir chevelu (pellicules, démangeaisons)', price: 3500, duration: 45, commission: 20 },
  { code: 'SOI05', cat: 'SOI', name: 'Soin protéiné / reconstructeur', price: 7500, priceMax: 10000, duration: 75, commission: 20 },
  { code: 'SOI06', cat: 'SOI', name: 'Masque hydratant + coupe des pointes', price: 3000, duration: 45, commission: 20 },
];

/** Catégories de dépenses avec compte SYSCOHADA indicatif (à faire valider par un comptable). */
export const EXPENSE_CATEGORIES = [
  { code: 'LOYER', name: 'Loyer', syscohadaAccount: '6222' },
  { code: 'EAU', name: 'Eau (ONEA)', syscohadaAccount: '6051' },
  { code: 'ELECTRICITE', name: 'Électricité (SONABEL)', syscohadaAccount: '6052' },
  { code: 'SALAIRES', name: 'Salaires', syscohadaAccount: '661' },
  { code: 'COMMISSIONS', name: 'Commissions', syscohadaAccount: '6611' },
  { code: 'PRODUITS', name: 'Produits capillaires (consommés directement)', syscohadaAccount: '604' },
  { code: 'FOURNITURES', name: 'Fournitures', syscohadaAccount: '6054' },
  { code: 'TRANSPORT', name: 'Transport', syscohadaAccount: '618' },
  { code: 'COMMUNICATION', name: 'Communication (téléphone, internet)', syscohadaAccount: '628' },
  { code: 'ENTRETIEN', name: 'Entretien et réparations', syscohadaAccount: '624' },
  { code: 'PUBLICITE', name: 'Publicité', syscohadaAccount: '627' },
  { code: 'IMPOTS', name: 'Impôts et taxes (CME, patente)', syscohadaAccount: '64' },
  { code: 'FRAIS_FINANCIERS', name: 'Frais bancaires et Mobile Money', syscohadaAccount: '631' },
  { code: 'AUTRES', name: 'Autres charges', syscohadaAccount: '658' },
];

export const PRODUCT_CATEGORIES = [
  { code: 'SHAMPOING', name: 'Shampoings' },
  { code: 'HUILE', name: 'Huiles et beurres' },
  { code: 'GEL', name: 'Gels' },
  { code: 'CIRE', name: 'Cires' },
  { code: 'LOCKS', name: 'Produits dreadlocks' },
  { code: 'PEIGNE', name: 'Peignes' },
  { code: 'BROSSE', name: 'Brosses' },
  { code: 'ACCESSOIRE', name: 'Accessoires' },
  { code: 'MECHE', name: 'Mèches et rajouts' },
  { code: 'FOURNITURE', name: 'Fournitures salon' },
];

export const PACKAGES = [
  { code: 'LOCKS-M', name: 'Entretien Locks Royal (mensuel)', description: '2 retouches racines ou retwists par mois', price: 12000, durationDays: 30, visits: 2, services: ['ENT01', 'ENT02', 'ENT03'] },
  { code: 'BARBE-M', name: 'Barbier Royal (mensuel)', description: '4 coupes (dégradé ou coupe + barbe) par mois', price: 7500, durationDays: 30, visits: 4, services: ['COH01', 'COH02', 'COH03'] },
  { code: 'SOIN-M', name: 'Soin Couronne (mensuel)', description: '2 soins profonds par mois', price: 8000, durationDays: 30, visits: 2, services: ['SOI02', 'SOI03', 'ENT04'] },
];
