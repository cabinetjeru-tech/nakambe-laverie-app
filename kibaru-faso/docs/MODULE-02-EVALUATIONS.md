# Module 02 — Générateur de devoirs et évaluations : mise en œuvre

Conçu sur le modèle du Module 01, à partir des règles déjà validées : sujet, corrigé et barème séparés
(configuration V2, § 13), versions A/B/C (§ 14), types d'évaluation et grille critériée (moteur pédagogique, § 14),
corrigé vérifié (moteur § 13, Module 01 § 15). À ajuster si un cahier des charges détaillé du Module 02 est fourni.

## Parcours

- **Demande libre** : « Crée-moi un devoir de mathématiques de 4e sur les équations, noté sur 20, en versions A, B et C ».
  Le moteur reconnaît le type d'évaluation, le barème, le nombre de versions et d'exercices, les notions évaluées.
  S'il manque la classe, la matière ou les notions, une seule question est posée (« Sur quel(s) chapitre(s) ou
  notion(s) doit porter cette interrogation ? »).
- **Formulaire « Générateur de devoirs et évaluations »** (accueil, cartes « Un devoir », « Une évaluation »,
  « Interrogation écrite », « Sujet blanc ») : classe, discipline et notions (requis), type (8 types), durée, note sur
  10 / 20 / 40 / 100, nombre d'exercices, difficulté, types de questions, versions, corrigé, tableau de
  spécification, grille critériée, consignes.

## Production (prompt, bloc MODULE 02)

Tableau de spécification (exercice × notion × niveau cognitif × points × statut) → `DOCUMENT 1 — SUJET` (en-tête,
points par exercice et par question, aucune réponse, aucune mention de la plateforme) → `DOCUMENT 2 — CORRIGÉ`
(même numérotation, démarche, points par étape, calculs écrits « 7 × 8 = 56 ») → `DOCUMENT 3 — BARÈME` (et grille
critériée). Versions : mêmes notions, même structure, même total, données différentes. Orientations officielles
d'évaluation utilisées seulement si elles figurent dans la base ; un sujet généré n'est jamais présenté comme officiel.

Chaque document s'imprime ou s'exporte séparément ; le sujet imprimé ne porte aucune mention PÉDAGOGUE.IA
(ni pied de page, ni titre de page).

## Contrôle automatique (affiché sous la réponse)

| Contrôle | Exemple de signal |
|---|---|
| Total des points du sujet = note annoncée | « Barème du sujet : les points totalisent 18, pour une note sur 20. » |
| Sujet sans réponse | « Le sujet « Sujet » semble contenir des réponses. » |
| Corrigé complet | « Corrigé incomplet : exercice 2 sans correction repérée. » |
| Points du corrigé = points du sujet | « Points du corrigé (6) différents de ceux du sujet (18). » |
| Versions : nombre demandé, comparables | « 3 versions demandées, 2 sujet(s) repéré(s). » |
| Calculs du corrigé | « Calcul(s) à vérifier dans le corrigé : 7 × 8 = 54 (on trouve 56). » |

Le contrôle calculatoire vérifie les égalités numériques simples (+, −, ×, ÷, :, /, décimaux à virgule, priorités
opératoires, arrondis) et ignore les égalités avec inconnue ou les fractions non réduites, pour éviter les faux signaux.

## Commandes sous une évaluation

Version B · Plus facile · Plus difficile · Ajouter un exercice · Barème sur 40 · Grille critériée · Tableau de
spécification · Sujet imprimable.
