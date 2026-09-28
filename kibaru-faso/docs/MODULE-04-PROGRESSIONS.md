# Module 04 — Générateur de progressions : mise en œuvre

Conçu à partir des règles déjà validées : prompt initial (§ 4 : ne jamais inventer une progression officielle),
configuration V2 (tableau de bord « Mes progressions »), architecture documentaire (type PROGRESSION, statuts,
« officiel ≠ actuel »), moteur pédagogique (§ 6 : ordre de recherche programme → guide → référentiel → progression)
et structure des Modules 01 à 03. À ajuster si un cahier des charges détaillé du Module 04 est fourni.

## Principe

- Une **progression officielle** (document de type PROGRESSION, ACTIF, pour la classe et la matière) figurant dans les
  extraits est suivie et citée ; l'adaptation au calendrier de l'enseignant signale chaque écart.
- Sinon, la production est une **PROPOSITION de progression PÉDAGOGUE.IA**, à comparer à la progression officielle de
  l'établissement ou de la circonscription. Elle n'est jamais appelée « progression officielle ».
- Le **volume horaire hebdomadaire** est une donnée officielle : il est demandé à l'enseignant, jamais deviné. Le nombre
  de semaines, s'il manque, est une hypothèse de travail annoncée, à ajuster au calendrier scolaire officiel.
  Le calendrier (rentrée, vacances, compositions, examens) n'est jamais inventé.

## Parcours

- **Demande libre** : « Construis une progression de mathématiques en 6e pour le 1er trimestre, 4 h par semaine sur
  10 semaines ». Le moteur reconnaît la classe (sans confondre « 3e trimestre » avec la classe de 3e), la matière, la
  période, le volume hebdomadaire, le nombre de semaines, la durée des séances, et calcule les heures disponibles.
  Sans volume horaire, une seule question : « Quel est le volume horaire hebdomadaire de cette matière dans votre
  classe (ex. 4 h par semaine) ? » — la réponse courte (« 4 h par semaine ») complète la demande précédente.
- **Formulaire « Générateur de progressions »** (accueil, carte « Une progression ») : classe, discipline et heures
  par semaine (requis), période, durée d'une séance, nombre de semaines (calcul des heures disponibles affiché), date
  de début, chapitres à couvrir, semaines réservées, placer les évaluations, marge de rattrapage.
- **Priorité entre modules** : « Construis une progression… avec les évaluations » reste une progression ;
  « Prépare un devoir conforme à ma progression » reste un devoir (Module 02) — le premier besoin exprimé l'emporte.

## Structure produite (prompt, bloc MODULE 04)

Paramètres et hypothèses (heures disponibles = volume × semaines, calcul écrit) · Références documentaires ·
Tableau de progression (Semaine | Chapitre / leçon | Heures | Objectifs | Évaluation | Statut ; colonne Dates si une
date de début est donnée) · Répartition par chapitre (avec total) · Évaluations prévues · Réserve et rattrapage
(≈ 10 %) — puis statut des informations et point à vérifier.

## Contrôle automatique (affiché sous la réponse)

| Contrôle | Exemple de signal |
|---|---|
| Tableau de progression présent | « Tableau de progression (colonne « Semaine ») non repéré… » |
| Semaines dans l'ordre | « Les semaines du tableau de progression ne sont pas dans l'ordre. » |
| Semaines disponibles | « La progression va jusqu'à la semaine 12, pour 10 semaines disponibles. » |
| Volume total ≤ heures disponibles | « Volume planifié : 50 h, pour 40 h disponibles (4 h × 10 semaines). » |
| Temps largement inutilisé (< 70 %) | « Volume planifié : 20 h sur 40 h disponibles : plus de 30 % du temps n'est pas utilisé. » |
| Volume hebdomadaire par ligne (heures ou séances × durée) | « 1 ligne(s) du tableau dépassent le volume hebdomadaire de 4 h. » |
| Évaluations prévues | « Aucune évaluation prévue dans le tableau de progression. » |
| Jamais « officielle » sans source ACTIVE | « La progression semble présentée comme officielle sans source ACTIVE qui la confirme. » |

## Commandes sous une progression

Recalculer pour 3 h / semaine · Version trimestrielle · Ajouter les dates · Plus de temps pour un chapitre ·
Ajouter les évaluations · Détailler en séances · Tableau imprimable.
