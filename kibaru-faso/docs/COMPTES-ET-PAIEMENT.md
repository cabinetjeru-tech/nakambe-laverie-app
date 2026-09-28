# Comptes enseignants, abonnements, paiement et administration

## Ce que voit l'enseignant

1. **Inscription / connexion** par e-mail et mot de passe (mot de passe oublié par e-mail).
2. **Abonnement** : sans abonnement actif, une page présente les formules (par défaut 2 000 FCFA / mois et
   15 000 FCFA / an) avec paiement **mobile money** (Orange Money, Moov Money via CinetPay). Un paiement fait
   avant la fin de l'abonnement le **prolonge** sans perte de jours. Rappel 5 jours avant la fin.
3. **Mon compte** (en haut à droite) : abonnement, historique des paiements, profil, déconnexion.
4. **Mes préparations** sont sauvegardées en ligne et retrouvées sur tous ses appareils. Les préparations déjà
   présentes sur l'appareil sont reprises dans le compte à la première connexion.
5. Impression, PDF et Word : inchangés (sous chaque production).

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
5. **CinetPay** : ouvrir un compte marchand (pièces d'identité, documents de l'entreprise), récupérer
   `CINETPAY_API_KEY` et `CINETPAY_SITE_ID`, les ajouter dans Vercel. Adresse de notification :
   `https://pedagogue-ia.vercel.app/api/paiement/notification`. Faire un paiement réel de faible montant pour
   valider l'intégration (l'API n'a pas pu être testée en direct pendant le développement).
   En attendant, l'administration peut activer les abonnements à la main.
