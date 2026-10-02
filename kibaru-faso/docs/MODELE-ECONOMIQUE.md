# Modèle économique de PÉDAGOGUE.IA

Ce document explique comment les prix et les quotas ont été calculés, pour pouvoir les réviser avec les coûts réels. Le tableau de bord de l'admin enregistre le coût réel de chaque génération.

## Hypothèses (à recalibrer après 2 à 4 semaines d'usage réel)

| Poste | Valeur retenue | Source |
|---|---|---|
| Coût IA d'une génération standard (Claude Sonnet 5.5) | **50 FCFA** (≈ 0,08 $) | Tarif public Anthropic, fiche complète avec réflexion, consignes en cache |
| Mode expert (Claude Opus 5.5) | 2 × plus cher : **compte pour 2 générations** | Tarif public : 4 $ / 20 $ contre 2 $ / 10 $ par million de jetons |
| Frais fixes mensuels | **≈ 28 000 FCFA** | Vercel Pro 20 $ + Supabase Pro 25 $ + domaine (≈ 1 $/mois) |
| Commission de parrainage | **10 %** des abonnements mensuels et annuels (pas sur le pass journalier) | Règle de l'application |
| Frais de paiement mobile money | **≈ 3,5 %** | Ordre de grandeur des agrégateurs, à confirmer avec le prestataire |
| Taux de change | 1 $ ≈ 600 FCFA | |

## La formule

Pour chaque formule :

> **Prix ≥ (plafond de générations × coût unitaire IA + part des frais fixes) ÷ (1 − commission − frais de paiement)**

La règle d'équité retenue : **même dans le pire cas** (abonné parrainé qui utilise 100 % de son plafond), PÉDAGOGUE.IA ne perd pas d'argent. La marge vient de l'usage moyen, qui est inférieur au plafond.

## Les formules en vigueur (décision du 2026-10-02)

| Formule | Prix | Générations | Max/jour | Prix par génération |
|---|---|---|---|---|
| Essai | 0 FCFA | **1 fiche offerte** (valable 30 jours) | — | — |
| Pass 24 h | 500 FCFA | 4 | 4 | 125 FCFA |
| Mensuel | 7 500 FCFA | 40 | 6 | 187,5 FCFA |
| Annuel | 30 000 FCFA (soit 2 500 FCFA/mois) | 400 | 8 | 75 FCFA |

Avec cette grille, l'annuel est **de loin le plus avantageux** : il coûte le prix de 4 mois. C'est un choix commercial assumé pour pousser l'engagement à l'année.

## Vérification, par abonné

| | Mensuel, pire cas | Mensuel, usage moyen | Annuel, pire cas | Annuel, usage moyen | Pass 24 h, pire cas | Essai |
|---|---|---|---|---|---|---|
| Générations utilisées | 40 | 20 | 400 | 200 | 4 | 1 |
| IA | 2 000 | 1 000 | 20 000 | 10 000 | 200 | 50 |
| Part des frais fixes (100 abonnés) | 280 | 280 | 3 360 | 3 360 | 10 | — |
| Commission 10 % (parrainé / 1 sur 2) | 750 | 375 | 3 000 | 1 500 | 0 | — |
| Code promo 5 % | 375 | 375 | 1 500 | 1 500 | — | — |
| Frais de paiement 3,5 % | 263 | 263 | 1 050 | 1 050 | 18 | — |
| **Total des coûts** | **3 668** | **2 293** | **28 910** | **17 410** | **228** | **50** |
| **Marge** | **+3 832 (51 %)** | **+5 207 (69 %)** | **+1 090 (4 %)** | **+12 590 (42 %)** | **+272 (54 %)** | **−50** (coût d'acquisition) |

Montants en FCFA. Le pire cas suppose un abonné parrainé qui utilise aussi un code promo et tout son quota.

**Seuil de rentabilité :** les frais fixes (≈ 28 000 FCFA par mois) sont couverts à partir d'environ **6 abonnés mensuels** ou **2 à 3 abonnés annuels** par mois à usage moyen.

## Points de vigilance

- **Codes promo :** 5 % par défaut. Sur l'annuel, le pire cas reste positif jusqu'à environ 8 % de remise : au-delà, réservez les remises au mensuel.
- **Essai :** 1 fiche offerte par nouvel inscrit, soit ≈ 50 FCFA de coût d'acquisition par enseignant (variable `QUOTA_ESSAI`).
- **TVA :** les prix ci-dessus sont des prix payés par l'enseignant. Si MEGAVISION est assujettie à la TVA (18 %), celle-ci est comprise dedans et réduit la marge. Vérifier le régime fiscal avec le comptable.
- **Recalibrage :** après 2 à 4 semaines, relever le coût moyen réel par génération dans l'admin et reprendre la formule. Si le coût réel est de 35 FCFA au lieu de 50, on peut augmenter les plafonds ou baisser les prix.
