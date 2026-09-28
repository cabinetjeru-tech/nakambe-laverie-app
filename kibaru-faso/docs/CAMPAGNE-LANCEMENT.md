# Campagne de lancement — objectif 5 000 enseignants abonnés

Outils intégrés à la plateforme :

| Outil | Où | Rôle |
|---|---|---|
| Page de présentation | `https://pedagogue-ia.vercel.app/decouvrir` | Page publique, aperçu illustré sur WhatsApp et Facebook |
| Essai gratuit 24 h | automatique à l'inscription | Faire essayer sans friction |
| Code promo | `/admin` → Campagne (code `LANCEMENT` : -25 %, 45 jours) | Convertir l'essai en abonnement |
| Parrainage 20 % | « Mon compte » de chaque enseignant | Faire recruter les enseignants par les enseignants |
| Messages prêts | `/admin` → Campagne (copier / WhatsApp) | Diffusion rapide et homogène |
| Suivi | `/admin` → Tableau de bord | Progression vers 5 000, essais, filleuls, recettes |

## Le calcul

5 000 abonnés ≈ 25 000 à 35 000 enseignants touchés × 40 % d'inscription à l'essai × 35 % de conversion.
Le parrainage démultiplie : 500 « ambassadeurs » qui amènent chacun 10 collègues = 5 000.

## Plan en 4 phases (12 semaines)

**Semaines 1-2 — Ambassadeurs (objectif 100 abonnés).**
Recruter 30 à 50 enseignants de confiance (un par grand établissement de Ouagadougou et Bobo-Dioulasso, un par discipline).
Leur offrir 1 mois (`/admin` → Enseignants → +30 j) contre un retour d'expérience et le partage de leur lien de parrainage.
Recueillir 5 témoignages courts (nom, discipline, établissement, phrase) pour les messages.

**Semaines 3-6 — Réseaux d'enseignants (objectif 1 000).**
Diffuser les messages de `/admin` → Campagne dans les groupes WhatsApp d'enseignants, par discipline et par région ;
pages Facebook d'enseignants et de parents d'élèves ; un message par groupe et par semaine au maximum.
Mettre en avant le code `LANCEMENT` avec sa date limite : l'échéance déclenche la décision.

**Semaines 7-10 — Établissements et institutions (objectif 3 000).**
Démonstration de 15 minutes lors des conseils d'enseignement et des journées pédagogiques (CAP, animations pédagogiques),
avec inscription sur place depuis le téléphone (l'essai de 24 h commence immédiatement).
Proposer aux chefs d'établissement un code promo dédié (ex. `LYCEEZINDA`, -30 %, 50 utilisations) pour suivre chaque établissement.
Radio locale et communautaire : un spot de 30 secondes avec l'adresse de la page.

**Semaines 11-12 — Rentrée et compositions (objectif 5 000).**
Les périodes de devoirs et de compositions sont celles où l'outil fait gagner le plus de temps : relancer à ce moment-là.
Concours du meilleur parrain du mois (1 an d'abonnement offert) annoncé dans les groupes.

## Rituels hebdomadaires

- Lundi : lire le tableau de bord (inscrits, essais, abonnés, recettes, parrainages).
- Mercredi : verser les commissions dues (`/admin` → Parrainage), puis annoncer publiquement « X FCFA versés aux parrains cette semaine » : c'est la meilleure publicité du parrainage.
- Vendredi : relancer par WhatsApp les enseignants dont l'essai est terminé sans abonnement (liste dans `/admin` → Enseignants, filtre « Sans abonnement »).

## Points de vigilance

- Ne jamais présenter les productions comme des documents officiels du ministère : l'argument est le gain de temps et la qualité, avec l'enseignant qui reste maître de ses cours.
- Intégrer les programmes et guides officiels dans la base documentaire renforce la crédibilité auprès des inspecteurs et conseillers pédagogiques.
- Avant une diffusion massive : brancher un service d'envoi d'e-mails (Supabase limite les e-mails de confirmation à quelques envois par heure) et valider un vrai paiement CinetPay.
