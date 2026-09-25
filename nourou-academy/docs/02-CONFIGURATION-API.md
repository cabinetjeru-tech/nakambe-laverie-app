# 02 — Configuration des API et services externes

Toutes les clés peuvent être saisies dans **Administration › Paramètres** (chiffrées en base) ou fournies en
variables d'environnement (voir `.env.example`). Une clé saisie dans l'administration est prioritaire.
Les clés ne sont jamais affichées en clair : seuls les 4 derniers caractères apparaissent.

## 1. Intelligence artificielle

### Anthropic (recommandé pour le tuteur, la correction et le générateur)
1. Créer un compte sur console.anthropic.com, ajouter un moyen de paiement, créer une clé API.
2. Paramètres › IA : coller la clé, fournisseur « Anthropic », modèle (par défaut `claude-opus-5`), effort.
   - Effort « medium » : bon équilibre qualité / coût pour le tutorat ; « low » pour réduire la facture ; « high »
     pour une qualité maximale sur les corrections.
   - Le repli serveur en cas de refus (`fallbacks: "default"`) est activé automatiquement pour les modèles qui le
     proposent.
3. Cliquer sur « Lancer le test ».

### OpenAI (optionnel, complémentaire)
Active : la **recherche sémantique** (embeddings `text-embedding-3-small`, 1536 dimensions), la **transcription**
vocale en français et la **synthèse vocale** côté serveur. Peut aussi servir de fournisseur principal (modèle
configurable). Après l'ajout de la clé, lancer `npm run rag:reindex` pour vectoriser les contenus existants.

### Maîtrise des coûts
- Quota par apprenant (requêtes / jour) et par formateur (générations / jour).
- Budget mensuel global en tokens : au-delà, les fonctions IA sont suspendues jusqu'au mois suivant.
- Rapports › Usage de l'IA : requêtes et tokens par fonction et par modèle.

## 2. Paiements

URL de notification (webhook / IPN) à déclarer chez chaque prestataire :
`https://VOTRE-DOMAINE/api/payments/webhook/cinetpay` (ou `paydunya`, `wave`).
URL de retour : gérée automatiquement (`/paiement/<référence>`).

> Vérifiez **avant activation** : la disponibilité de chaque moyen (Orange Money, Moov Money, Wave, cartes) dans
> vos pays cibles, l'éligibilité de votre compte marchand, les frais et les délais de reversement. Aucune
> disponibilité n'est supposée par la plateforme.

### CinetPay
- Informations : *Site ID*, *API Key*, *Secret Key* (Intégration › Mes paramètres).
- Fonctionnement : initialisation `POST /v2/payment`, notification signée (`x-token`, HMAC-SHA256), puis
  **vérification** `POST /v2/payment/check` : seul le statut `ACCEPTED` avec un montant ≥ au total active l'accès.
- Montants en XOF multiples de 5 (arrondi automatique).

### PayDunya
- Informations : *Master Key*, *Private Key*, *Token* ; mode Test puis Production.
- Fonctionnement : facture `checkout-invoice/create`, IPN authentifié (hash SHA-512 de la Master Key), puis
  **confirmation** `checkout-invoice/confirm/<token>` (`status = completed`).

### Wave
- API Checkout de Wave Business (pays où l'API marchande est proposée — à vérifier pour votre compte).
- Informations : clé API, secret de signature des webhooks.
- Fonctionnement : session `POST /v1/checkout/sessions`, webhook signé (`Wave-Signature`, HMAC-SHA256,
  horodatage vérifié à ±5 min), puis lecture de la session (`payment_status = succeeded`).

### Mode démonstration
`PAYMENT_DEMO_ENABLED=true` affiche un « prestataire de démonstration ». Il est **désactivé automatiquement** quand
`APP_ENV=production`. Les commandes démo sont marquées `DEMO`, exclues du chiffre d'affaires et leurs factures portent
« DÉMONSTRATION — SANS VALEUR ».

### Remboursements
La plateforme enregistre la décision et retire l'accès ; le remboursement financier se fait depuis le tableau de bord
du prestataire (aucune API de remboursement n'est appelée automatiquement).

## 3. Emails (SMTP)
Paramètres › Technique : serveur, port, utilisateur, mot de passe, expéditeur. Fournisseurs possibles : Brevo,
Mailjet, Amazon SES, le serveur de votre hébergeur… Bouton « M'envoyer un email de test ». Tant que le SMTP n'est
pas configuré, les emails restent en file (`EmailOutbox`) et partent à la configuration (tâche `outbox`).

## 4. Visioconférence (Jitsi Meet)
- Par défaut : `meet.jit.si` (gratuit, public). Bien pour démarrer ; l'enregistrement n'y est pas garanti.
- Recommandé : Jitsi auto-hébergé (avec Jibri pour l'enregistrement) ou **JaaS / 8x8.vc** avec authentification
  JWT : renseigner le domaine, l'App ID et le secret. Les jetons sont signés côté serveur (le formateur est
  modérateur).
- Alternative : lien externe (Google Meet, Zoom) saisi par le formateur.
- Replays : le formateur colle le lien de la vidéo publiée ; visible des apprenants autorisés.

## 5. Stockage des fichiers
- `STORAGE_DRIVER=local` : fichiers dans `STORAGE_LOCAL_DIR` (volume Docker `uploads` en production).
- `STORAGE_DRIVER=s3` : `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`
  (Cloudflare R2, AWS S3, Wasabi, MinIO, Supabase Storage en mode S3). Les fichiers privés sont servis par URL
  présignées d'une heure.
- Vidéos : compresser en 720p H.264 (≈ 5–8 Mo/min). Pour un gros volume ou le streaming adaptatif, utiliser un
  hébergeur vidéo (Bunny Stream, Vimeo, Cloudflare Stream…) et coller l'URL dans la leçon.

## 6. Supabase (option)
Utiliser l'URL « Transaction pooler » dans `DATABASE_URL` et l'URL directe dans `DIRECT_URL`. L'extension `vector`
est disponible (Database › Extensions). Les migrations activent le RLS et ne donnent aux rôles `anon` /
`authenticated` que la lecture du catalogue public (voir docs/04). L'authentification de l'application reste la sienne
(sessions serveur) : n'exposez pas la clé `service_role`.
