# Module 01 — Générateur intelligent de fiches pédagogiques (v1.0) : mise en œuvre

« Code » : fait par l'application ; « Prompt » : règle appliquée par le modèle (`src/lib/prompt.ts`, bloc MODULE 01).

| § | Sujet | Où | Mise en œuvre |
|---|---|---|---|
| 1 | Mission : documentation → analyse → proposition → fiche | Code + Prompt | Le moteur de décision active le Module 01 pour toute demande de fiche et transmet la recherche ciblée. |
| 2 | Interface conversationnelle | Code | « Prépare-moi une fiche de cours sur les fractions pour une classe de 6e » → classe 6e, thème fractions, type fiche ; question unique : « Très bien. Pour quelle discipline souhaitez-vous cette fiche : Mathématiques ou une autre matière ? » avec boutons de réponse. |
| 3-4 | Formulaire structuré ; informations facultatives | Code | Bouton « Générateur de fiches pédagogiques » : classe, discipline, thème, sous-thème, type de séance (7 types), durée, nombre d'apprenants ; volet facultatif (niveau, difficultés, prérequis, matériel, méthode, contexte, objectif personnel). Seuls classe, discipline et thème sont requis. |
| 5 | Profil de l'enseignant | Code | Panneau « Mon profil » : nom, établissement, ville, année scolaire, préférences, format habituel. Conservé sur l'appareil (comptes : à venir). Sert à personnaliser, jamais à modifier les exigences officielles. Matière et classes enseignées : panneau « Ma classe » ; historique : « Mes préparations ». |
| 6 | Recherche avant génération | Code | Pays + classe + matière + thème + sous-thème + type de séance, dans l'ordre programme > guide > référentiel > progression > institutionnel > complémentaire. |
| 7 | Analyse documentaire | Prompt | Compétence, objectif, contenu, prérequis, démarche, activités, durée, évaluation, critères, remédiation cherchés dans les extraits ; rien d'inventé comme officiel. |
| 8 | Officiel / proposition | Prompt | « Éléments documentés » / « Construction pédagogique PÉDAGOGUE.IA » ; « Objectif documenté » / « Proposition de formulation opérationnelle PÉDAGOGUE.IA ». |
| 9 | Structure A–F | Prompt | Identification (avec le profil), références, compétence (« Compétence officielle non confirmée dans la base PÉDAGOGUE.IA disponible. » si absente), objectifs observables, prérequis, matériel sans équipement numérique supposé. |
| 10 | Déroulement en tableau, somme des durées | Prompt + Code | Tableau Étape / Durée / Activités de l'enseignant / des apprenants / Ressources. **Contrôle automatique** : somme des durées = durée annoncée, et total indiqué = somme. |
| 11-17 | Situation de départ, activités précises, trace écrite, évaluation, corrigé vérifié, remédiation, différenciation non figée | Prompt | Règles reprises ; formulation vague « faire participer les élèves » signalée automatiquement. |
| 18 | Contrôle automatique de qualité | Prompt + Code | Le modèle vérifie avant de répondre ; l'application signale ensuite : durées, rubriques manquantes, compétence non confirmée présentée comme officielle, références et ID inconnus, numéro de page sans source. |
| 19 | Commandes rapides | Code + Prompt | Boutons sous chaque fiche : plus simple, version 50 minutes, évaluation, corrigé, classe faible, activité pour les meilleurs élèves, mode expert, mode rapide, fiche imprimable. |
| 20 | Modèle de demande rapide | Code | Lignes « Classe : … / Matière : … / Thème : … / Durée : … / Type : … / Difficulté de la classe : … » reconnues ; elles priment sur le panneau « Ma classe ». |
| 21-22 | Modes expert et rapide | Code + Prompt | « Mode expert » / « Mode rapide » dans la demande, le formulaire ou le profil ; rubriques attendues adaptées dans le contrôle. |
| 23 | Modèle de sortie | Prompt | FICHE PÉDAGOGIQUE, puis rubriques 1 à 13. |
| 24 | Principe fondamental | Prompt | Documentée + cohérente + réalisable + adaptée + transparente. |
