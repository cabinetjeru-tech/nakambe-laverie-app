# Modèle économique de PÉDAGOGUE.IA

Ce document explique comment les prix et les quotas ont été calculés, pour pouvoir les réviser avec les coûts réels. Le tableau de bord de l'admin enregistre le coût réel de chaque génération.

## Hypothèses (à recalibrer après 2 à 4 semaines d'usage réel)

| Poste | Valeur retenue | Source |
|---|---|---|
| Coût IA d'une génération standard (Claude Sonnet 5.5) | **50 FCFA** (≈ 0,08 $) | Tarif public Anthropic, fiche complète avec réflexion, consignes en cache |
| Mode expert (Claude Opus 5.5) | 2 × plus cher : **compte pour 2 générations** | Tarif public : 4 $ / 20 $ contre 2 $ / 10 $ par million de jetons |
| Frais fixes mensuels | **≈ 28 000 FCFA** | Vercel Pro 20 $ + Supabase Pro 25 $ + domaine (≈ 1 $/mois) |
| Commission de parrainage | **20 %** des abonnements mensuels et annuels (pas sur le pass journalier) | Règle de l'application |
| Frais de paiement mobile money | **≈ 3,5 %** | Ordre de grandeur des agrégateurs, à confirmer avec le prestataire |
| Taux de change | 1 $ ≈ 600 FCFA | |

## La formule

Pour chaque formule :

> **Prix ≥ (plafond de générations × coût unitaire IA + part des frais fixes) ÷ (1 − commission − frais de paiement)**

La règle d'équité retenue : **même dans le pire cas** (abonné parrainé qui utilise 100 % de son plafond), PÉDAGOGUE.IA ne perd pas d'argent. La marge vient de l'usage moyen, qui est inférieur au plafond.

## Les formules qui en résultent

| Formule | Prix | Générations | Max/jour | Coût unitaire pour l'enseignant |
|---|---|---|---|---|
| Pass 24 h | 300 FCFA | 4 | 4 | 75 FCFA |
| Mensuel | 3 000 FCFA | 40 | 6 | 75 FCFA |
| Annuel | 30 000 FCFA (10 mois payés, 12 mois d'accès) | 400 | 8 | 75 FCFA |

Le prix par génération est identique dans toutes les formules : c'est l'équité. L'annuel offre 2 mois gratuits, en échange d'un engagement sur l'année.

## Vérification, par abonné

| | Mensuel, pire cas | Mensuel, usage moyen | Annuel, pire cas | Annuel, usage moyen | Pass 24 h, pire cas |
|---|---|---|---|---|---|
| Générations utilisées | 40 | 20 | 400 | 200 | 4 |
| IA | 2 000 | 1 000 | 20 000 | 10 000 | 200 |
| Part des frais fixes (100 abonnés) | 280 | 280 | 3 360 | 3 360 | 10 |
| Commission (parrainé / 1 sur 2) | 600 | 300 | 6 000 | 3 000 | 0 |
| Frais de paiement | 105 | 105 | 1 050 | 1 050 | 11 |
| **Total des coûts** | **2 985** | **1 685** | **30 410** | **17 410** | **221** |
| **Marge** | **+15** (équilibre) | **+1 315 (44 %)** | **≈ −400** (équilibre) | **+12 590 (42 %)** | **+79 (26 %)** |

Montants en FCFA.

**Seuil de rentabilité :** les frais fixes (≈ 28 000 FCFA par mois) sont couverts à partir d'environ **22 abonnés mensuels** à usage moyen.

## Points de vigilance

- **Codes promo :** une remise de plus de 10 % sur le mensuel fait passer le pire cas en perte. Réserver les grosses remises au premier mois ou au lancement.
- **Essai gratuit :** 5 générations au maximum par nouvel inscrit, soit ≈ 250 FCFA de coût d'acquisition par enseignant.
- **TVA :** les prix ci-dessus sont des prix payés par l'enseignant. Si MEGAVISION est assujettie à la TVA (18 %), celle-ci est comprise dedans et réduit la marge. Vérifier le régime fiscal avec le comptable.
- **Recalibrage :** après 2 à 4 semaines, relever le coût moyen réel par génération dans l'admin et reprendre la formule. Si le coût réel est de 35 FCFA au lieu de 50, on peut augmenter les plafonds ou baisser les prix.
