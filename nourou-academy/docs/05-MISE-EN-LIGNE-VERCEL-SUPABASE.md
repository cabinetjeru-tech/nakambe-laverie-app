# 05 — Mise en ligne rapide : Vercel + Supabase

Objectif : obtenir une adresse `https://…vercel.app` pour voir et tester la plateforme, sans serveur à gérer.
Durée : 30 à 45 minutes. Aucune ligne de commande nécessaire.

> **À savoir avant de commencer**
> - L'offre gratuite de Vercel (« Hobby ») est réservée à un **usage non commercial** : parfaite pour la
>   démonstration et les tests. Pour vendre des formations, passez à l'offre Vercel Pro (environ 20 $/mois) ou
>   utilisez un serveur (docs/03).
> - Offre gratuite Supabase : 500 Mo de base, 1 Go de stockage de fichiers (suffisant pour tester ; les vidéos
>   demandent plus d'espace ou un hébergeur vidéo). Un projet gratuit inactif une semaine est mis en pause.

## Étape 1 — Supabase (base de données + stockage des fichiers)

1. Créez un compte sur **supabase.com**, puis **New project** :
   nom `nourou-academy`, mot de passe de base de données fort (**notez-le**), région **West EU (Paris)**.
2. **Extension vectorielle** : menu *Database › Extensions*, cherchez `vector`, activez-la.
3. **Adresses de connexion** : bouton **Connect** (en haut) › onglet **ORMs** › **Prisma**. Copiez :
   - `DATABASE_URL` (port **6543**, se termine par `?pgbouncer=true`) — ajoutez `&connection_limit=1` à la fin ;
   - `DIRECT_URL` : prenez l'adresse **Session pooler** (port **5432**) proposée dans *Connect › Connection string*.
   Remplacez `[YOUR-PASSWORD]` par le mot de passe de l'étape 1.
4. **Stockage** : menu *Storage* › **New bucket** : nom `nourou`, **privé** (ne cochez pas « Public »).
5. **Accès S3 au stockage** : *Project Settings › Storage* (section **S3 Connection**) :
   - vérifiez que la connexion S3 est activée, notez l'**Endpoint** (`https://<projet>.supabase.co/storage/v1/s3`)
     et la **Region** ;
   - **New access key** : notez l'*Access key ID* et la *Secret access key* (affichée une seule fois).

## Étape 2 — Préparer les secrets

Générez 5 valeurs aléatoires longues (par exemple sur un générateur de mots de passe, 40 caractères, sans espace) :
`SESSION_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `FILE_SIGNING_SECRET`, `CRON_SECRET`, `SETUP_TOKEN`.
Conservez-les dans un gestionnaire de mots de passe. **`SETTINGS_ENCRYPTION_KEY` ne doit plus jamais changer.**

## Étape 3 — Vercel (l'application)

1. Créez un compte sur **vercel.com** avec votre compte GitHub.
2. **Add New › Project** › importez le dépôt `nakambe-laverie-app`.
3. **Root Directory** : cliquez *Edit* et choisissez **`nourou-academy`**. Le framework « Next.js » est détecté.
4. **Environment Variables** — ajoutez :

| Nom | Valeur |
|---|---|
| `APP_ENV` | `staging` (tests) ou `production` (le paiement de démonstration est alors désactivé) |
| `APP_URL` | provisoirement `https://nourou-academy.vercel.app` (corrigé à l'étape 5) |
| `DATABASE_URL` | adresse port 6543 de l'étape 1.3 |
| `DIRECT_URL` | adresse port 5432 de l'étape 1.3 |
| `SESSION_SECRET`, `SETTINGS_ENCRYPTION_KEY`, `FILE_SIGNING_SECRET`, `CRON_SECRET`, `SETUP_TOKEN` | valeurs de l'étape 2 |
| `PAYMENT_DEMO_ENABLED` | `true` pour tester les achats sans argent réel (ignoré si `APP_ENV=production`) |
| `STORAGE_DRIVER` | `s3` |
| `S3_ENDPOINT` | endpoint de l'étape 1.5 |
| `S3_REGION` | région de l'étape 1.5 (ex. `eu-west-3`) |
| `S3_BUCKET` | `nourou` |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | clés de l'étape 1.5 |
| `S3_FORCE_PATH_STYLE` | `true` |

5. **Deploy**. Le déploiement crée automatiquement les tables (migrations) — comptez 3 à 5 minutes.
   Notez l'adresse obtenue (ex. `https://nourou-academy-xxxx.vercel.app`), mettez-la dans `APP_URL`
   (*Settings › Environment Variables*), puis *Deployments › … › Redeploy*.

> Le code se trouve actuellement sur la branche `claude/nourou-edtech-platform-5s8jww`. Vercel déploie la branche
> principale (`main`) en « production » : fusionnez la pull request dans `main`, ou choisissez la branche dans
> *Settings › Git › Production Branch*.

## Étape 4 — Installation (dans le navigateur)

1. Ouvrez `https://VOTRE-ADRESSE.vercel.app/installation`.
2. Saisissez le `SETUP_TOKEN`, votre nom, votre email et un mot de passe (12 caractères minimum).
3. Laissez cochée l'option **données de démonstration** pour voir la plateforme remplie
   (5 formations ; comptes `apprenant@demo.nourou-academy.local` et `formateur.marketing@demo.nourou-academy.local`,
   mot de passe `Demo2026!`).
4. Vous arrivez dans l'administration. La page `/installation` disparaît définitivement.

## Étape 5 — Réglages dans l'administration

*Administration › Paramètres* :
- **Identité** : logo, couleurs, contacts.
- **Intelligence artificielle** : clé Anthropic (et OpenAI si souhaité), puis « Lancer le test ».
- **Paiements** : à configurer quand vos comptes marchands sont prêts (docs/02).
- **Technique** : SMTP pour les emails.

## Étape 6 — Tâches automatiques

`vercel.json` programme les tâches (emails, rappels, vérification des paiements, abonnements) **une fois par jour**
(limite de l'offre gratuite). Pour une exécution toutes les 5 minutes, créez une tâche gratuite sur
**cron-job.org** : URL `https://VOTRE-ADRESSE/api/cron/all`, méthode **POST**, en-tête
`Authorization: Bearer <CRON_SECRET>`, toutes les 5 minutes.

## Limites propres à Vercel (déjà prises en compte)

| Limite | Solution intégrée |
|---|---|
| Pas de disque permanent | Fichiers stockés dans Supabase Storage (`STORAGE_DRIVER=s3`) ; alerte dans le tableau de bord sinon |
| Requêtes limitées à 4,5 Mo | Vidéos, supports et images envoyés **directement du navigateur vers le stockage** (URL signée), puis contrôlés côté serveur ; photos envoyées au tuteur compressées automatiquement ; pièces jointes de devoirs : 4 Mo au total conseillés |
| Durée des fonctions | Longues réponses du tuteur : activer *Fluid compute* (Settings › Functions) ; sinon une réponse très longue peut être coupée |
| Plusieurs instances | Le limiteur anti-abus est par instance (protection plus faible) ; pour un usage important, utiliser un serveur (docs/03) ou Redis |

## En cas de problème

- **Erreur au déploiement « P1001 / can't reach database »** : vérifier `DIRECT_URL` (Session pooler, port 5432) et le
  mot de passe.
- **« type vector does not exist »** : activer l'extension `vector` (étape 1.2) puis redéployer.
- **Envoi de fichier refusé (« CORS »)** : vérifier `S3_ENDPOINT`, les clés et que le bucket `nourou` existe ;
  redéployer après toute modification de `S3_ENDPOINT` (il est intégré à la politique de sécurité au moment du build).
- **Page /installation : « SETUP_TOKEN n'est pas défini »** : ajouter la variable puis redéployer.
