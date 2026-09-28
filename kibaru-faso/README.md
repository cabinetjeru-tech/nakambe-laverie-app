# PÉDAGOGUE.IA

**L'intelligence au service de la pédagogie.**

Assistant pédagogique pour les enseignants de l'enseignement secondaire au Burkina Faso (6e à Terminale) :
préparation de leçons et de fiches pédagogiques, progressions, situations-problèmes, exercices progressifs,
devoirs avec corrigé et barème, interrogations, évaluations, remédiation, différenciation, séances de révision,
et export en document imprimable ou Word.

Application indépendante des autres projets de ce dépôt. Elle fonctionne avec Claude (Anthropic).

## Principes (configuration V2)

- **Priorité absolue à la base documentaire PÉDAGOGUE.IA.** Avant chaque réponse, l'application recherche les passages
  pertinents dans la base (`base-documentaire/`, déposée par l'administrateur) et dans la bibliothèque personnelle de
  l'enseignant. Les connaissances générales du modèle ne viennent qu'en dernier recours, et sont signalées comme telles.
- **Base évolutive et versionnée, selon la structure documentaire officielle** : 9 catégories
  (`01_PROGRAMMES_ET_CURRICULA` … `09_ARCHIVES`), puis pays / niveau / classe / matière / type / année / version.
  Chaque ressource a une fiche (ID unique, statut ACTIF, PROVISOIRE, À VÉRIFIER, REMPLACÉ ou ARCHIVE, priorité,
  dates…). Un document ancien n'est jamais obsolète par défaut, un document récent jamais applicable par défaut :
  seul un remplacement déclaré vers une ressource ACTIVE écarte l'ancienne, qui reste dans l'historique.
- **Module 01 — Générateur de fiches pédagogiques** ([détail](docs/MODULE-01-FICHES.md)) : formulaire guidé ou
  demande libre, fiche documentée en 13 rubriques, déroulement minuté dont la **somme des durées est vérifiée
  automatiquement**, modes standard / expert / rapide, commandes « plus simple », « version 50 minutes »…
- **Module 02 — Générateur de devoirs et évaluations** ([détail](docs/MODULE-02-EVALUATIONS.md)) : 8 types
  d'évaluation, tableau de spécification, sujet / corrigé / barème séparés, versions A-B-C ; **contrôle automatique**
  du total des points, du sujet sans réponse, du corrigé complet, des versions et des calculs du corrigé.
- **Module 03 — Générateur de remédiation** ([détail](docs/MODULE-03-REMEDIATION.md)) : difficulté → hypothèses →
  diagnostic → activités → exercices → nouvelle vérification → consolidation ; **contrôle automatique** des étapes, des
  causes formulées comme hypothèses, du vocabulaire non stigmatisant, du critère de réussite et des calculs du corrigé.
- **Moteur de décision pédagogique** ([détail](docs/MOTEUR-DECISION-PEDAGOGIQUE.md)) : pour chaque demande,
  identification du besoin (24 catégories) et du contexte (une seule question si la classe ou la matière manque),
  recherche ciblée (`BF-6E-MATH`…), sélection des sources (autorité, pertinence, actualité, statut, version,
  périmètre, cohérence), niveau de confiance, puis génération par le modèle et **contrôle final automatique**
  affiché à l'enseignant.
- **Registre maître et moteur de décision documentaire.** Toutes les ressources sont inscrites au registre (ID
  `BF-[CLASSE]-[MATIERE]-[NUMERO]`). Avant chaque réponse, l'application identifie classe et matière, recense les
  ressources, compare les versions, applique les remplacements et évalue une **confiance documentaire** (élevée,
  moyenne, faible, aucune), transmise au modèle et affichée à l'enseignant. Officiel ≠ automatiquement actuel.
- **Jamais d'invention présentée comme officielle.** Chaque production distingue **SOURCE PÉDAGOGUE.IA** (avec renvoi
  [R1]… vers l'extrait consulté), **PROPOSITION PÉDAGOGUE.IA**, **CONNAISSANCE GÉNÉRALE** et **À VÉRIFIER**.
- **L'enseignant reste responsable** : il vérifie, adapte et valide chaque contenu avant usage en classe.

Le prompt système complet se trouve dans [`src/lib/prompt.ts`](src/lib/prompt.ts) : la configuration V2 du
projet (sections 1 à 30), suivie d'une partie qui explique au modèle comment l'application lui transmet le contexte
de l'enseignant et la base documentaire.

**État de chaque section de la V2 (fait / partiel / à faire) : [`docs/FEUILLE-DE-ROUTE-V2.md`](docs/FEUILLE-DE-ROUTE-V2.md).**

## Ce que contient l'application

| Élément | Détail |
|---|---|
| Panneau « Ma classe » | Classe, discipline, thème, durée, niveau et difficultés, effectif, établissement : joints à chaque demande |
| Accueil | Les sept choix du message de démarrage : un cours, un devoir, une évaluation, un corrigé, une progression, une activité de remédiation, une activité pédagogique ; plus : construire pas à pas, fiche, exercices progressifs, versions A/B/C, interrogation, différenciation, révision |
| Conversation | Réponses en direct (streaming) ; 13 modifications en un clic (simplifier, développer, exemples, exercices, réduire la durée, classe faible / avancée, situation-problème, corrigé, barème, transformer en devoir ou en fiche, résumer) |
| Mes préparations | Classées en cours, devoirs, corrigés, évaluations, progressions, remédiation, activités ; historique complet |
| Documents | Base documentaire PÉDAGOGUE.IA (serveur, versionnée, avec archives) + « Ma bibliothèque » : documents personnels PDF / Word / texte (lus puis conservés dans le navigateur) |
| Recherche | Extraits retrouvés par classement BM25, filtrés par classe et matière, pondérés par le niveau de fiabilité, cités [R1]… |
| Export | Copier, imprimer ou enregistrer en PDF, Word ; chaque document d'un devoir (sujet, corrigé, barème, versions A/B/C) exportable séparément — un sujet ne porte aucune mention PÉDAGOGUE.IA |
| Mobile | Mise en page adaptée au téléphone ; installable sur l'écran d'accueil (Android, ordinateur) |
| Confidentialité | Conversations, contexte et documents personnels restent sur l'appareil de l'enseignant (localStorage). Le serveur ne conserve rien |
| Accès | Code d'accès partagé facultatif (`KIBARU_ACCESS_CODE`), limitation du nombre de demandes par minute |

## Démarrer en local

Prérequis : Node.js 20+.

```bash
cd kibaru-faso
npm install
cp .env.example .env.local   # puis renseigner ANTHROPIC_API_KEY (et un code d'accès si besoin)
npm run dev                  # http://localhost:3100
```

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API Anthropic (obligatoire) | — |
| `KIBARU_MODEL` | Modèle Claude | `claude-opus-5` |
| `KIBARU_EFFORT` | Profondeur de réflexion : `low`, `medium`, `high` | `medium` |
| `KIBARU_ACCESS_CODE` | Code demandé aux enseignants ; vide = accès libre | — |
| `KIBARU_SESSION_SECRET` | Secret de signature du cookie d'accès | clé API |
| `KIBARU_RATE_LIMIT` | Demandes par minute et par adresse IP | `12` |

> **En ligne, définissez un code d'accès.** Sans lui, toute personne qui connaît l'adresse peut utiliser
> l'assistant, et les appels sont facturés sur votre compte Anthropic.

Avec `claude-opus-5`, l'application active le repli automatique côté serveur proposé par l'API Anthropic
(`fallbacks: "default"`) : si une demande est refusée par le modèle principal, elle est reprise par un autre
modèle dans le même appel, au lieu d'échouer.

## Alimenter la base documentaire

Inscrivez chaque ressource au **registre maître** (`base-documentaire/REGISTRE_MAITRE.csv`), déposez son document dans
son dossier de la structure officielle (`base-documentaire/`, formats `.pdf` texte,
`.docx`, `.txt`, `.md`) avec sa fiche descriptive, puis lancez `npm run base:verifier` et `npm run base:catalogue`.
Structure, métadonnées, statuts et règles de versions : [`base-documentaire/LISEZ-MOI.md`](base-documentaire/LISEZ-MOI.md).
Catalogue à jour : [`base-documentaire/CATALOGUE.md`](base-documentaire/CATALOGUE.md).

**Aucun texte officiel n'est encore intégré.** Le registre maître (`base-documentaire/REGISTRE_MAITRE.csv`) recense
21 guides pédagogiques du post-primaire (6e à 3e), tous « À VÉRIFIER » et NON ENCORE INTÉGRÉS : leurs documents restent
à déposer. PÉDAGOGUE.IA ne doit s'appuyer
que sur des textes authentiques, dont l'origine est connue. Tant que la base est vide, les réponses sont présentées
comme des propositions ou des connaissances générales.

## Mise en ligne (Vercel)

1. Importer le dépôt dans Vercel et choisir `kibaru-faso` comme **Root Directory** (framework Next.js détecté).
2. Renseigner les variables d'environnement ci-dessus (au minimum `ANTHROPIC_API_KEY` et `KIBARU_ACCESS_CODE`).
3. Déployer. Chaque ajout dans `base-documentaire/` nécessite un nouveau déploiement.

Les réponses longues (devoir complet avec corrigé) peuvent prendre une à plusieurs minutes : la durée maximale
de la route de conversation est fixée à 300 s (`maxDuration`), ce que permettent les offres Vercel actuelles.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement, compilation, production (port 3100) |
| `npm run lint` | Vérification TypeScript |
| `npm run base:verifier` / `base:catalogue` | Contrôle de la base documentaire / génération de `CATALOGUE.md` |
| `npm run base:nouvel-id -- 6e Mathématiques` | Prochain ID libre pour une nouvelle ressource (ex. `BF-6E-MATH-002`) |
| `npm test` | Tests unitaires (recherche, versions et archives, hiérarchie des sources, métadonnées, contexte, rubriques, séparation des documents, prompt) |

## Structure

```
kibaru-faso/
├── base-documentaire/     base documentaire officielle (9 catégories, fiches, CATALOGUE.md)
├── scripts/base.ts        vérification de la base et génération du catalogue
├── src/app/               page unique + routes API : chat (streaming), extract, acces, referentiels
├── src/components/        interface (application, rendu Markdown avec badges de transparence)
├── src/lib/               prompt, recherche BM25, bibliothèque, extraction PDF/DOCX, accès, export
└── tests/
```

## Limites connues et évolutions possibles

- Les PDF scannés (images) ne sont pas lus : fournir une version texte, ou ajouter une reconnaissance de caractères.
- La recherche est lexicale (mots-clés) : suffisante pour des programmes structurés ; une recherche sémantique
  (embeddings) pourra être ajoutée si la bibliothèque devient volumineuse.
- Le limiteur de requêtes est en mémoire, par instance serveur.
- Les conversations ne sont pas synchronisées entre appareils (stockage local, par choix de confidentialité).
