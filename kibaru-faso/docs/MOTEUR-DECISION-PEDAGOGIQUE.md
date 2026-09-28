# Moteur de décision pédagogique — V1 : mise en œuvre

Correspondance entre les 22 sections du « Moteur de décision pédagogique V1 » et l'application.
« Code » : fait de façon déterministe par l'application, avant ou après l'appel au modèle.
« Prompt » : règle appliquée par le modèle (`src/lib/prompt.ts`).

| § | Sujet | Où | Mise en œuvre |
|---|---|---|---|
| 1 | Mission : d'abord ce que la base permet d'affirmer | Code + Prompt | Aucune réponse sans passage par le moteur : chaque demande reçoit un bloc `<decision_pedagogique>`. |
| 2 | Chaîne de traitement | Code + Prompt | Besoin → contexte → recherche → sélection → statut → confiance (code, `src/lib/base/decision.ts`) → raisonnement et génération (modèle) → contrôle final (modèle, puis contrôle automatique, `src/lib/base/final-check.ts`). |
| 3 | Identification du besoin (24 catégories, combinables) | Code | `src/lib/base/needs.ts`. Ex. « devoir avec corrigé et barème » → devoir + correction + barème. |
| 4 | Contexte minimal et pédagogique, questions utiles seulement | Code + Prompt | Classe et matière indispensables pour une production spécialisée : une seule question si elles manquent. Durée, type de séance… : hypothèse annoncée, pas de question. La demande écrite l'emporte sur le panneau « Ma classe » ; une réponse courte (« Classe : 6e ») complète la demande précédente. |
| 5 | Exemple « leçon sur les fractions » | Code | Matière déduite du thème (Mathématiques, « à confirmer »), classe manquante → question « Pour quelle classe… : 6e, 5e, 4e, 3e, 2nde, 1ère ou Terminale ? » ; boutons de classe sous la réponse. |
| 6 | Ordre de recherche, cible `BF-6E-MATH` | Code | Préfixe d'ID calculé ; pondération programme/curriculum > guide > référentiel > progression > autres. |
| 7 | Score de pertinence A à G | Code | Pour chaque source : autorité, pertinence, actualité, statut, version, périmètre, cohérence — transmis au modèle. |
| 8 | Priorité des sources | Code | Officielle active spécifique > officielle active générale > officielle à vérifier > institutionnelle > pédagogique > connaissance générale. Ni l'ancienneté ni la nouveauté ne décident seules. |
| 9 | Niveaux de confiance | Code | ÉLEVÉE, MOYENNE, FAIBLE, NON CONFIRMÉE — affichés au-dessus de chaque réponse. |
| 10 | Comportement selon la confiance | Prompt | Consigne adaptée à chaque niveau ; formulation exacte pour NON CONFIRMÉE. |
| 11 | Séparer source et création | Prompt | « Selon le guide disponible dans la base KIBARU : … » puis « Proposition pédagogique KIBARU : … ». |
| 12 | Fiche pédagogique en 15 points | Prompt + action rapide | Éléments documentés recherchés d'abord ; rien d'officiel inventé. |
| 13 | Génération d'exercices en 8 étapes | Prompt + contrôle | Exercices présentés comme productions de l'IA ; le contrôle automatique signale un corrigé absent. |
| 14 | Évaluations | Prompt + actions | Sujet blanc et grille critériée ajoutés. Orientations officielles privilégiées **si elles figurent dans les extraits**. |
| 15 | Remédiation en 7 étapes | Prompt + action | Avec activité de consolidation. |
| 16 | Différenciation en 3 niveaux, non stigmatisante | Prompt + action | Consolidation, niveau attendu, approfondissement. |
| 17 | Contrôle final | Prompt + Code | Liste de contrôle silencieuse du modèle ; puis contrôle automatique affiché : renvois [Rn] sans extrait, ID absents du registre, affirmation sur le « programme en vigueur » sans source ACTIVE, étiquette SOURCE KIBARU sans source, corrigé ou barème absent. |
| 18 | Réformes : prompt stable, base évolutive | Prompt | Le prompt ne décrit aucun « programme actuel ». |
| 19 | Règle de mise à jour | Outils | `npm run base:nouvel-id -- 6e Mathématiques` (ID), registre maître, `base:verifier`, `base:catalogue` ; historique jamais supprimé. |
| 20 | Format de réponse standard | Prompt | Contexte / Base documentaire / Proposition pédagogique / Statut des informations / Point à vérifier ; l'impression d'un corrigé s'arrête avant « Statut des informations ». |
| 21 | Règle d'or | Prompt | Reprise telle quelle. |
| 22 | Objectif final | — | Orientation du projet. |

## Deux phrases volontairement non reprises dans le prompt

Conformément à la section 18 (le prompt reste stable, la base évolue) et à l'interdiction d'inventer :

- Section 14 : « Les guides officiels disponibles montrent notamment l'importance accordée à l'évaluation formative
  et à l'évaluation critériée dans le cadre de l'API. » — aucun guide n'est encore intégré à la base : KIBARU ne
  peut pas l'affirmer. Cette orientation sera citée **depuis les guides** une fois ceux-ci intégrés.
- Section 18 : « Le ministère a encore annoncé en 2026 une révision des curricula et supports pédagogiques. » — fait
  daté, non vérifiable dans la base. Le prompt indique seulement que des révisions peuvent être en cours. Pour que
  KIBARU puisse en faire état, inscrivez l'annonce au registre (type `TEXTE_OFFICIEL` ou `NOTE_DE_SERVICE`, catégorie
  `07_REFERENTIELS_ET_TEXTES_OFFICIELS`) avec son document source.
