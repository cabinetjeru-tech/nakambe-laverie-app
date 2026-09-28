# KIBARU FASO

**L'intelligence pédagogique au service de l'enseignant.**

Assistant pédagogique pour les enseignants de l'enseignement secondaire au Burkina Faso (6e à Terminale) :
préparation de leçons et de fiches pédagogiques, progressions, situations-problèmes, exercices progressifs,
devoirs avec corrigé et barème, interrogations, évaluations, remédiation, différenciation, séances de révision,
et export en document imprimable ou Word.

Application indépendante des autres projets de ce dépôt. Elle fonctionne avec Claude (Anthropic).

## Principes (configuration V2)

- **Priorité absolue à la base documentaire KIBARU.** Avant chaque réponse, l'application recherche les passages
  pertinents dans la base (`referentiels/`, déposée par l'administrateur) et dans la bibliothèque personnelle de
  l'enseignant. Les connaissances générales du modèle ne viennent qu'en dernier recours, et sont signalées comme telles.
- **Base évolutive et versionnée.** Chaque document a sa fiche (identifiant, année, version, statut, niveau de
  fiabilité…). Une nouvelle version remplace l'ancienne sans la supprimer ; archives, documents déclassés et
  expirés ne sont plus consultés. Hiérarchie des sources en 5 niveaux.
- **Jamais d'invention présentée comme officielle.** Chaque production distingue **SOURCE KIBARU** (avec renvoi
  [R1]… vers l'extrait consulté), **PROPOSITION PÉDAGOGIQUE KIBARU**, **CONNAISSANCE GÉNÉRALE** et **À VÉRIFIER**.
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
| Documents | Base documentaire KIBARU (serveur, versionnée, avec archives) + « Ma bibliothèque » : documents personnels PDF / Word / texte (lus puis conservés dans le navigateur) |
| Recherche | Extraits retrouvés par classement BM25, filtrés par classe et matière, pondérés par le niveau de fiabilité, cités [R1]… |
| Export | Copier, imprimer ou enregistrer en PDF, Word ; chaque document d'un devoir (sujet, corrigé, barème, versions A/B/C) exportable séparément — un sujet ne porte aucune mention KIBARU |
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

Déposez les programmes, guides et progressions dans `referentiels/` (formats `.md`, `.txt`, `.pdf` texte, `.docx`)
avec leur fiche descriptive (identifiant, classes, matières, année, version, statut, niveau de fiabilité, document
remplacé…). Mode d'emploi détaillé et gestion des versions : [`referentiels/LISEZ-MOI.md`](referentiels/LISEZ-MOI.md).

**Aucun texte officiel n'est encore intégré** : seule la fiche descriptive du guide pédagogique de mathématiques 6e
(`BF-MATH-6E-GUIDE-001`) est présente ; le PDF lui-même reste à déposer à côté d'elle. KIBARU FASO ne doit s'appuyer
que sur des textes authentiques, dont l'origine est connue. Tant que la base est vide, les réponses sont présentées
comme des propositions ou des connaissances générales.

## Mise en ligne (Vercel)

1. Importer le dépôt dans Vercel et choisir `kibaru-faso` comme **Root Directory** (framework Next.js détecté).
2. Renseigner les variables d'environnement ci-dessus (au minimum `ANTHROPIC_API_KEY` et `KIBARU_ACCESS_CODE`).
3. Déployer. Chaque ajout dans `referentiels/` nécessite un nouveau déploiement.

Les réponses longues (devoir complet avec corrigé) peuvent prendre une à plusieurs minutes : la durée maximale
de la route de conversation est fixée à 300 s (`maxDuration`), ce que permettent les offres Vercel actuelles.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement, compilation, production (port 3100) |
| `npm run lint` | Vérification TypeScript |
| `npm test` | Tests unitaires (recherche, versions et archives, hiérarchie des sources, métadonnées, contexte, rubriques, séparation des documents, prompt) |

## Structure

```
kibaru-faso/
├── referentiels/          bibliothèque de référence (documents officiels à déposer)
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
