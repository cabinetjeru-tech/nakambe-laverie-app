# Comptes enseignants, abonnements, paiement et administration

Entreprise porteuse : **MEGAVISION**, Ouagadougou — +226 03 70 37 17 — megavision.gca@gmail.com
(coordonnées affichées aux enseignants : `src/lib/contact.ts`). Compte administrateur et compte marchand CinetPay :
megavision.gca@gmail.com.

## Ce que voit l'enseignant

1. **Inscription / connexion** par e-mail et mot de passe (mot de passe oublié par e-mail).
2. **Abonnement** : sans abonnement actif, une page présente les formules (par défaut 3 000 FCFA / mois et
   30 000 FCFA / an) avec paiement **mobile money** (Orange Money, Moov Money via CinetPay). Un paiement fait
   avant la fin de l'abonnement le **prolonge** sans perte de jours. Rappel 5 jours avant la fin.
3. **Mon compte** (en haut à droite) : abonnement, historique des paiements, profil, déconnexion.
4. **Mes préparations** sont sauvegardées en ligne et retrouvées sur tous ses appareils. Les préparations déjà
   présentes sur l'appareil sont reprises dans le compte à la première connexion.
5. Impression, PDF et Word : inchangés (sous chaque production).

## Essai gratuit de 24 h

Chaque nouvel inscrit reçoit automatiquement 24 h d'accès complet (créé par la base à l'inscription,
`supabase/migrations/0002_essai_parrainage.sql`). Un bandeau indique les heures restantes ; un abonnement payé
pendant l'essai s'ajoute après l'essai.

## Parrainage (commission de 20 %)

- Chaque enseignant a un **code** (6 caractères) et un **lien** : `https://pedagogue-ia.vercel.app/?parrain=CODE`,
  à copier ou à partager sur WhatsApp depuis « Mon compte ».
- Un collègue qui s'inscrit par ce lien est rattaché au parrain et reçoit ses 24 h d'essai.
- À **chaque paiement réussi** du filleul (mensuel ou annuel, y compris les renouvellements), le parrain gagne
  **10 %** du montant des abonnements mensuels et annuels (variable `PARRAINAGE_TAUX`), à condition d'être lui-même abonné (ou administrateur) et non
  suspendu au moment du paiement. Un paiement ne donne qu'une commission.
- Le parrain voit ses filleuls, les montants à recevoir et déjà reçus. L'administration verse les commissions par
  mobile money (numéro du profil) et les marque « versées » dans l'onglet **Parrainage** de `/admin`.

## Téléchargement PDF

Sous chaque production : **⬇ Télécharger PDF** (fichier A4 prêt à imprimer, aussi sur téléphone), **Imprimer**,
**Word**, et pour les évaluations un PDF séparé du sujet, du corrigé et du barème.

## Espace administration (`/admin`)

Réservé aux adresses listées dans `ADMIN_EMAILS` (elles deviennent administratrices à la connexion).

- **Tableau de bord** : enseignants inscrits, abonnés actifs, recettes du mois et totales, préparations.
- **Enseignants** : recherche, état de l'abonnement, accorder 30 / 90 / 365 jours ou un nombre libre
  (paiement en espèces, période d'essai, partenariat), suspendre / réactiver, donner les droits d'administration.
- **Paiements** : liste, statut, revérification d'un paiement « en attente ».
- **Tarifs** : libellé, prix (multiple de 5 FCFA), durée, formule proposée ou non.

## Sécurité

- Base Supabase (projet `pedagogue-ia`, schéma dans `supabase/migrations/`). Toutes les écritures passent par les
  routes serveur (clé secrète) ; les politiques RLS ne permettent à un enseignant que de lire ses propres lignes.
- `/api/chat` exige une session valide et un abonnement actif (ou un compte administrateur).
- La notification de paiement n'est jamais crue : le statut et le montant sont **revérifiés auprès de CinetPay**
  avant toute activation, et un paiement n'active qu'un seul abonnement.

## Mise en service

1. **Supabase** → Project Settings → API Keys : copier la **clé secrète** dans Vercel (`SUPABASE_SECRET_KEY`).
2. **Supabase** → Authentication → URL Configuration : *Site URL* = `https://pedagogue-ia.vercel.app`,
   *Redirect URLs* : `https://pedagogue-ia.vercel.app/auth/callback`.
3. **Supabase** → Authentication → Emails : le service d'e-mail intégré est limité à quelques envois par heure ;
   pour un vrai lancement, brancher un fournisseur SMTP (Brevo, Resend…) — ou désactiver « Confirm email ».
4. **Vercel** : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `ADMIN_EMAILS`, `APP_URL`, puis redéployer. Le code d'accès partagé n'est alors plus utilisé.
5. **CinetPay** (compte marchand de MEGAVISION, megavision.gca@gmail.com) : dans le tableau de bord CinetPay,
   rubrique **Intégration**, copier l'**API KEY** et le **SITE ID** ; dans Vercel, ajouter `CINETPAY_API_KEY` et
   `CINETPAY_SITE_ID` (Production), puis redéployer. Moyens proposés : `CINETPAY_CHANNELS` = `ALL` (défaut :
   mobile money + carte), `MOBILE_MONEY` ou `CREDIT_CARD`. Pour un nouveau compte marchand : ouvrir un compte marchand (pièces d'identité, documents de l'entreprise), récupérer
   `CINETPAY_API_KEY` et `CINETPAY_SITE_ID`, les ajouter dans Vercel. Adresse de notification :
   `https://pedagogue-ia.vercel.app/api/paiement/notification`. Faire un paiement réel de faible montant pour
   valider l'intégration (l'API n'a pas pu être testée en direct pendant le développement).
   En attendant, l'administration peut activer les abonnements à la main.
