# KIBARU FASO

**L'intelligence pédagogique au service de l'enseignant.**

Assistant pédagogique pour les enseignants de l'enseignement secondaire au Burkina Faso (6e à Terminale) :
préparation de leçons et de fiches pédagogiques, progressions, situations-problèmes, exercices progressifs,
devoirs avec corrigé et barème, interrogations, évaluations, remédiation, différenciation, séances de révision,
et export en document imprimable ou Word.

Application indépendante des autres projets de ce dépôt. Elle fonctionne avec Claude (Anthropic).

## Principes

- **Documents de référence d'abord.** Pour les programmes, compétences, objectifs, volumes horaires ou orientations
  officielles, KIBARU FASO s'appuie sur les documents qui lui sont fournis : la bibliothèque `referentiels/`
  (déposée par l'administrateur) et les documents ajoutés par chaque enseignant.
- **Jamais d'invention présentée comme officielle.** Chaque production distingue **SOURCE** (avec renvoi [R1]…
  vers l'extrait consulté), **PROPOSITION KIBARU** et **À VÉRIFIER**. En l'absence de document, l'assistant le
  dit et présente son contenu comme une proposition.
- **L'enseignant reste responsable** : il vérifie, adapte et valide chaque contenu avant usage en classe.

Le prompt système complet se trouve dans [`src/lib/prompt.ts`](src/lib/prompt.ts) : le texte de référence du
projet (sections 1 à 17), suivi d'une courte partie qui explique au modèle comment l'application lui transmet
le contexte de la classe et les documents.

## Ce que contient l'application

| Élément | Détail |
|---|---|
| Panneau « Ma classe » | Classe, discipline, thème, durée, niveau et difficultés, effectif, établissement : joints à chaque demande |
| Actions rapides | Leçon, fiche pédagogique, exercices progressifs (niveaux 1 à 4), devoir + corrigé, interrogation, évaluation, situation-problème, progression, remédiation, différenciation, révision, simplifier une notion |
| Conversation | Réponses en direct (streaming), suites proposées (classe faible, élèves avancés, barème, plus court, continuer) |
| Documents | Bibliothèque de référence (serveur) + documents personnels PDF / Word / texte (lus puis conservés dans le navigateur) |
| Recherche | Extraits pertinents retrouvés par classement BM25, filtrés par classe et discipline, cités [R1]… |
| Export | Copier, imprimer, Word ; pour un devoir : sujet et corrigé imprimables séparément (le sujet ne porte aucune mention KIBARU) |
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

## Alimenter la bibliothèque de référence

Déposez les programmes, guides et progressions officiels dans `referentiels/` (formats `.md`, `.txt`, `.pdf`
texte, `.docx`) et décrivez-les (titre, type, classes, disciplines, source). Mode d'emploi détaillé :
[`referentiels/LISEZ-MOI.md`](referentiels/LISEZ-MOI.md).

**Aucun document officiel n'est fourni avec l'application** : c'est volontaire. KIBARU FASO ne doit s'appuyer que
sur des textes authentiques, dont l'origine est connue. Tant que la bibliothèque est vide, les réponses sont
présentées comme des propositions.

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
| `npm test` | Tests unitaires (recherche, métadonnées, contexte, séparation sujet / corrigé, prompt) |

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
