# 01 — Architecture

## 1. Choix techniques

| Couche | Choix | Pourquoi |
|---|---|---|
| Application | **Next.js 15 (App Router) + TypeScript**, rendu serveur, Server Actions | Une seule application (site, espaces, API) : maintenance simple, pages légères (≈ 105 ko de JS initial) adaptées aux connexions lentes |
| Style | **Tailwind CSS 4**, composants maison accessibles | Charte bleu marine / bleu clair / blanc + accent doré, couleurs pilotées par l'administration (variables CSS) |
| Données | **PostgreSQL 15+ / Prisma 6** | Compatible Supabase ou tout PostgreSQL managé |
| Recherche IA | **pgvector** (index HNSW, cosinus) + **plein texte français** (`tsvector`, GIN) | Pas de base vectorielle séparée à exploiter ; fonctionne même sans fournisseur d'embeddings |
| IA | **Anthropic** (Claude, par défaut `claude-opus-5`, effort « medium », réflexion adaptative, repli serveur en cas de refus) ou **OpenAI** ; embeddings, transcription et synthèse vocales via OpenAI | Fournisseur et modèles configurables dans l'administration |
| Paiement | Architecture `PaymentProvider` : **CinetPay**, **PayDunya**, **Wave**, + prestataire de **démonstration** isolé | Orange Money / Moov Money / cartes via agrégateurs selon pays et contrat |
| Fichiers | Disque local ou **S3 compatible** ; URL signées à durée limitée | Vidéos servies avec requêtes partielles (reprise, lecture progressive) |
| Visio | **Jitsi Meet** (API externe), JWT optionnel ; ou lien externe (Google Meet, Zoom) | Partage d'écran, présence, faible débit (audio seul) |
| PWA | Manifeste dynamique + service worker maison | Installation Android, pages et supports hors ligne |

## 2. Modules

```
src/lib/
├── auth/            sessions (jeton aléatoire en cookie httpOnly, empreinte SHA-256 en base), mots de passe (bcrypt)
├── permissions.ts   matrice rôle → permissions (SUPERADMIN, ADMIN, TRAINER, ASSISTANT, LEARNER)
├── access.ts        règles d'accès aux formations / leçons (utilisées par pages, fichiers, RAG, quiz)
├── settings.ts      paramètres d'administration ; secrets chiffrés AES-256-GCM
├── ai/              llm (Anthropic/OpenAI, flux), tutor (prompt système + profil + sources), grading,
│                    generator, speech (voix), embeddings, quota (quotas et budget, journal d'usage)
├── rag/             extract (PDF, DOCX, PPTX, TXT/MD), chunk (découpage avec chevauchement), ingest, retrieve (hybride)
├── learning/        progression, correction automatique des quiz, soumission de quiz
├── certificates/    critères (fonction pure), délivrance, PDF avec QR code
├── payments/        pricing (coupons), providers/*, registry, checkout (commande, vérification, attribution), facture PDF
├── live/            Jitsi (configuration, JWT), droits de participation
├── storage/         local / S3, URL signées
├── uploads.ts       détection du vrai type de fichier par signature binaire
├── mail.ts, notify.ts  file d'emails (outbox) et notifications in-app
└── markdown.ts      rendu Markdown sûr (échappement systématique)
```

Les mutations passent par des **Server Actions** (`src/app/actions/*`) qui vérifient systématiquement la session,
la permission et la propriété de la ressource. Les routes `src/app/api/*` servent le flux du tuteur, les fichiers,
les téléversements, les webhooks, les exports, les PDF et les tâches planifiées.

## 3. Base de données (principales tables)

- **Utilisateurs** : `User`, `Session`, `PasswordResetToken`.
- **Catalogue** : `Category`, `Course` (statut de workflow, prix XOF, critères de certificat), `Module`, `Lesson`
  (VIDEO, TEXT, DOCUMENT, QUIZ, ASSIGNMENT, LIVE ; aperçu gratuit), `LessonAsset`, `StoredFile`.
- **Apprentissage** : `Enrollment` (source : achat, abonnement, gratuit, pack, admin ; dernière leçon),
  `LessonProgress` (position vidéo), `Note`, `Favorite`, `LearningGap` (lacunes pour le tuteur).
- **Évaluations** : `Quiz`, `Question`, `QuizAttempt` (GRADED / PENDING_REVIEW / VALIDATED), `Assignment`,
  `Submission`, `SubmissionFile`.
- **Commerce** : `Plan`, `Subscription`, `Pack`, `PackCourse`, `Coupon`, `Order` (mode DEMO / SANDBOX / LIVE),
  `PaymentEvent` (journal des webhooks et vérifications), `Invoice`, `Refund`.
- **Certificats** : `Certificate` (code unique, statut VALID / PENDING_APPROVAL / REVOKED).
- **Classes** : `LiveSession`, `LiveRegistration` (présence).
- **Communication** : `Notification`, `DirectMessage`, `SupportTicket`, `TicketReply`, `EmailOutbox`, `Report`.
- **Contenus** : `BlogPost`, `Faq`, `Review` (vérifié = auteur inscrit ; modération).
- **Administration** : `Setting` (dont secrets chiffrés), `AuditLog`.
- **IA** : `KnowledgeDocument`, `KnowledgeChunk` (`embedding vector(1536)`, `tsv` généré), `TutorConversation`,
  `TutorMessage` (citations), `AiUsage`, `GeneratedContent`.

Migrations : `prisma/migrations/`. La seconde migration ajoute la colonne plein texte générée, les index GIN / HNSW
et active le **Row Level Security** sur toutes les tables (voir docs/04). Prisma ne modélisant pas ces objets,
toute nouvelle migration doit être créée avec `prisma migrate dev --create-only` puis relue pour **retirer** les
instructions qui supprimeraient `tsv` ou les index vectoriels.

## 4. Le tuteur IA (Noura IA)

1. L'apprenant écrit (texte, voix transcrite, image ou PDF joint). Route `POST /api/tutor/chat` : session,
   limite de débit, quota journalier et budget mensuel.
2. **Droits** : `accessibleCourseIds()` calcule les formations dont l'apprenant peut voir le contenu (inscription,
   abonnement, gratuit, formateur, équipe).
3. **Récupération** : `retrievePassages()` combine la similarité vectorielle (si embeddings) et la recherche plein
   texte française (classée par nombre de termes trouvés), fusionnées par *Reciprocal Rank Fusion*, filtrées sur les
   formations autorisées, avec bonus pour la formation en cours.
4. **Contexte pédagogique** : niveau déclaré, progression, derniers résultats, lacunes identifiées (erreurs de quiz,
   retours de devoirs), leçon ouverte.
5. **Prompt système** : posture de formateur, adaptation au niveau, exemples locaux, règles de citation [S1],
   distinction « D'après le cours » / « En complément (connaissance générale) », signalement des informations
   absentes, protection contre les instructions injectées dans les contenus, interdiction de révéler un contenu non
   acheté ; consigne du mode choisi.
6. **Réponse en flux** (NDJSON) : métadonnées + sources, fragments de texte, fin. Conversation et citations
   enregistrées ; usage (tokens) journalisé sans le contenu.

Correction : les questions objectives sont corrigées sans IA ; les questions ouvertes et devoirs reçoivent une note
proposée selon le barème du formateur (sortie JSON structurée) et un retour détaillé. Les évaluations marquées
« validation humaine » et les devoirs par défaut restent en attente du formateur. **L'IA ne délivre jamais de
certificat** : `checkEligibility()` n'utilise que les critères du formateur et des notes validées.

## 5. Paiement

`startCheckout()` calcule le prix **côté serveur** (formation, pack ou abonnement, coupon), crée la commande
`PENDING`, puis redirige vers le prestataire. L'accès n'est attribué que par `fulfillOrder()` (transactionnel,
idempotent : un webhook rejoué n'a aucun effet), appelé uniquement après `verifyOrder()` — interrogation
serveur-à-serveur de l'API du prestataire avec contrôle du montant, de la devise et de la référence. La page de
retour n'est qu'un affichage ; elle relance au besoin une vérification. Une tâche planifiée réconcilie les commandes
en attente et expire celles de plus de 48 h.

## 6. Connectivité et mobile

Mode faible consommation (profil ou cookie) : vidéos chargées à la demande, images décoratives masquées, visio en
audio / basse résolution. Progression vidéo sauvegardée toutes les 15 s et gardée sur le téléphone en cas de coupure
(file locale synchronisée au retour du réseau). Supports « gardés hors ligne » dans le cache de l'appareil, page
`/hors-ligne`. Téléchargements et vidéos servis avec `Range` (reprise des téléchargements interrompus).
Le tuteur IA, les paiements et le streaming vidéo nécessitent une connexion.
