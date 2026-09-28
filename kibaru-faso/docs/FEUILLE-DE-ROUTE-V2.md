# MON PROF.IA — état de la configuration V2

Correspondance entre les 30 sections de la configuration V2 et l'application actuelle.
« Fait » = disponible et testé ; « Prompt » = règle appliquée par le modèle via le prompt système ;
« À faire » = nécessite des développements (comptes, base de données, applications mobiles…).

| § | Sujet | État | Détail |
|---|---|---|---|
| 1 | Plateformes | Partiel | Web (ordinateur, navigateur, téléphone). Installable sur l'écran d'accueil Android (application Web installable). Applications natives Android / iOS : à faire. |
| 2 | Public, classes 6e → Terminale | Fait | Sélecteur de classe ; disciplines en saisie libre avec suggestions. |
| 3 | Priorité à la base documentaire | Fait + Prompt | Recherche systématique dans la base avant chaque réponse ; priorités 1-2-3 dans le prompt. |
| 4 | Base évolutive | Fait | Structure documentaire officielle en 9 catégories (`base-documentaire/`) ; ajout, remplacement, archivage, expiration ; historique conservé. |
| 5 | Métadonnées | Fait | Fiche obligatoire (ID unique, statut, priorité, dates d'intégration, de vérification, de remplacement…), complétée par le chemin ; contrôlée par `npm run base:verifier`. |
| 6 | Gestion des versions | Fait | `remplace:` archive l'ancienne version sans la supprimer ; les archives sont signalées au modèle mais jamais consultées. |
| 7 | Hiérarchie des sources | Fait + Prompt | `fiabilite` 1 à 4 pondère la recherche et est transmise au modèle ; niveau 5 = connaissance générale. |
| 8 | Transparence (4 étiquettes) | Fait | SOURCE MON PROF.IA, PROPOSITION PÉDAGOGIQUE MON PROF.IA, CONNAISSANCE GÉNÉRALE, À VÉRIFIER, affichées en couleur. |
| 9 | Interdiction d'inventer | Prompt | Phrase exacte en l'absence d'information. Aucun document officiel n'est fourni d'office. |
| 10 | Profil de l'enseignant | Partiel | Panneau « Ma classe » (classe, matière, établissement, niveau…) conservé sur l'appareil. Comptes : à faire. |
| 11 | Tableau de bord | Partiel | « Mes préparations » classées : cours, devoirs, corrigés, évaluations, progressions, remédiation, activités, historique ; « Ma bibliothèque ». Sur l'appareil uniquement ; synchronisation entre appareils : à faire (comptes). |
| 12 | Préparation d'un cours | Fait | Action « Un cours », structure dans le prompt. |
| 13 | Devoirs : sujet / corrigé / barème | Fait | Impression et export Word séparés pour chaque document ; le sujet ne porte aucune mention MON PROF.IA. |
| 14 | Versions A, B, C | Fait | Action « Versions A, B et C », documents imprimables séparément. |
| 15 | Types d'évaluation | Fait | Actions « Une évaluation », « Interrogation écrite ». |
| 16 | Remédiation | Fait | Action dédiée, démarche en 6 étapes dans le prompt. |
| 17 | Différenciation | Fait | Action dédiée (difficulté, moyen, avancé, guidage). |
| 18 | Conception pas à pas | Fait + Prompt | Action « Construire pas à pas » ; le modèle pose au plus trois questions. |
| 19 | Modifier une production | Fait | 13 boutons sous chaque réponse (simplifier, développer, … résumer) ; export par les boutons Imprimer / PDF et Word. |
| 20 | Export PDF / Word | Partiel | Impression directe ; PDF via « Enregistrer en PDF » de la fenêtre d'impression ; fichier Word (.doc, ouvert par Word et réenregistrable en .docx). Génération native PDF / DOCX : à faire. |
| 21 | Recherche multicritère | Fait | Moteur de décision documentaire en 7 étapes (identification, recensement, filtrage, versions, remplacements, confiance, consigne) ; registre maître `REGISTRE_MAITRE.csv`. |
| 22 | Mise à jour de la base | Partiel | Dépôt dans `base-documentaire/`, contrôle (`base:verifier`), catalogue (`base:catalogue`), redéploiement. Interface d'administration : à faire. |
| 23 | Espace administrateur | À faire | Utilisateurs, établissements, documents, versions, abonnements, statistiques : nécessite comptes et base de données. |
| 24 | Architecture | Fait | Documents → base → recherche → contexte → modèle → application → enseignant. |
| 25 | Évolution | Fait | Aucune limite de classes ou de matières ; il suffit d'ajouter des documents. |
| 26 | Confidentialité | Fait | Aucune donnée d'enseignant stockée sur le serveur ; code d'accès ; les documents personnels restent sur l'appareil. |
| 27 | Limites de l'IA | Prompt | Pas d'accès Internet dans l'application ; interdiction de prétendre l'inverse. |
| 28-29 | Objectif, règle absolue | Prompt | Repris intégralement. |
| 30 | Message de démarrage | Fait | Écran d'accueil avec les sept choix. |

## Prochaines étapes proposées (dans l'ordre)

1. **Alimenter la base** : intégrer le guide de mathématiques 6e (en attente du fichier), puis les programmes en vigueur.
2. **Comptes enseignants et synchronisation** (sections 10, 11) : base de données (par exemple Supabase, déjà utilisé
   pour Akambi Academy), connexion, historique sur tous les appareils.
3. **Espace administrateur** (sections 22, 23) : dépôt de documents et saisie de leur fiche dans le navigateur,
   gestion des versions sans redéploiement, statistiques d'usage.
4. **Exports natifs PDF et DOCX** (section 20).
5. **Applications mobiles** (section 1) : d'abord l'application Web installable, puis Android natif si nécessaire.
6. **Abonnements** (section 23), si le modèle économique le prévoit.
