# WhatsApp professionnel : agent IA de renseignement

L'agent répond automatiquement aux personnes qui écrivent au **+226 03 70 37 17**. Il répond sur l'offre, les tarifs, l'essai, l'inscription, le paiement, le parrainage et les licences. Il lit les prix **à jour** dans la base : si vous changez un tarif dans l'admin, il le sait immédiatement.

Il **passe la main à un conseiller** dans les cas suivants :
- la personne le demande ;
- un paiement a été fait mais l'accès n'est pas activé ;
- un problème de compte ou une réclamation ;
- une demande de licence établissement, de devis, de partenariat, ou pour devenir ambassadeur ;
- un message vocal ou une image ;
- il n'est pas sûr de sa réponse.

Vous recevez alors un e-mail. La conversation apparaît en rouge dans **Admin → 💬 WhatsApp**, où vous pouvez répondre, reprendre la main ou la rendre à l'IA.

Prérequis : la clé **ANTHROPIC_API_KEY** doit être active, comme pour l'application.

## Étape 0 — Le numéro +226 03 70 37 17 est-il déjà utilisé dans l'application WhatsApp Business ?

L'agent IA passe par l'**API WhatsApp Cloud** de Meta, l'outil officiel des entreprises. C'est un service différent de l'application WhatsApp Business du téléphone. Trois cas :

1. **Coexistence (le mieux) :** si Meta vous la propose au moment d'ajouter le numéro, acceptez. Vous gardez l'application WhatsApp Business sur le téléphone **et** l'API répond en même temps. La disponibilité dépend du pays et de la procédure d'inscription : à vérifier lors de l'étape 3.
2. **Migration :** le numéro passe entièrement sur l'API. Il ne fonctionne plus dans l'application du téléphone et l'historique de l'application n'est pas repris. Vous répondez alors uniquement depuis l'onglet admin.
3. **Deuxième numéro :** une puce dédiée à l'agent IA (par exemple « PÉDAGOGUE.IA Assistance »), et le 03 70 37 17 reste dans l'application pour les échanges personnels avec les clients.

## Étape 1 — Compte Meta Business de MEGAVISION

1. Allez sur **business.facebook.com** et créez le portefeuille d'entreprise **MEGAVISION** avec l'adresse megavision.gca@gmail.com.
2. Lancez la **vérification de l'entreprise** (Paramètres → Centre de sécurité). Documents : RCCM, IFU ou équivalent. Elle lève les limites d'envoi et permet d'afficher le nom de l'entreprise.

## Étape 2 — Application Meta

1. Allez sur **developers.facebook.com** → *Mes applications* → *Créer une application* → type **Entreprise**, rattachée au portefeuille MEGAVISION.
2. Dans l'application, ajoutez le produit **WhatsApp**.
3. Dans *Paramètres de l'application → Général* :
   - renseignez l'URL de la politique de confidentialité : `https://pedagogue-ia.vercel.app/conditions` ;
   - copiez la **clé secrète de l'application** : c'est `WHATSAPP_APP_SECRET`.

## Étape 3 — Ajouter le numéro

1. Dans *WhatsApp → Configuration de l'API*, cliquez sur *Ajouter un numéro de téléphone*.
2. Renseignez le nom affiché (par exemple **PÉDAGOGUE.IA — MEGAVISION**), la catégorie **Éducation**, puis le numéro **+226 03 70 37 17**. Validez avec le code reçu par SMS ou appel (voir l'étape 0).
3. Copiez l'**identifiant du numéro de téléphone** (*Phone number ID*) : c'est `WHATSAPP_PHONE_NUMBER_ID`.

## Étape 4 — Jeton d'accès permanent

1. Allez dans *Paramètres de l'entreprise → Utilisateurs → Utilisateurs système* et ajoutez un utilisateur système **Administrateur**.
2. Attribuez-lui l'application et le compte WhatsApp, avec contrôle total.
3. Cliquez sur *Générer un jeton* :
   - autorisations `whatsapp_business_messaging` et `whatsapp_business_management` ;
   - expiration : **jamais**.
4. Copiez-le **en entier** : c'est `WHATSAPP_TOKEN`.

## Étape 5 — Variables dans Vercel (projet pedagogue-ia)

| Variable | Valeur |
|---|---|
| `WHATSAPP_TOKEN` | le jeton permanent (étape 4) |
| `WHATSAPP_PHONE_NUMBER_ID` | l'identifiant du numéro (étape 3) |
| `WHATSAPP_APP_SECRET` | la clé secrète de l'application (étape 2) |
| `WHATSAPP_VERIFY_TOKEN` | une phrase secrète inventée, par exemple `pedagogue-ia-2026-ouaga` |

Ensuite : Deployments → **Redeploy**.

Variables facultatives :
- `WHATSAPP_MAX_REPONSES_JOUR` : plafond de réponses IA par jour, 300 par défaut ;
- `WHATSAPP_MAX_PAR_CONTACT_JOUR` : plafond par contact et par jour, 30 par défaut.

## Étape 6 — Webhook (Meta envoie les messages reçus à l'application)

1. Dans *WhatsApp → Configuration*, section **Webhook**, cliquez sur *Modifier* :
   - URL de rappel : `https://pedagogue-ia.vercel.app/api/whatsapp` ;
   - jeton de vérification : la même phrase que `WHATSAPP_VERIFY_TOKEN`.
2. Cliquez sur *Vérifier et enregistrer*. L'application répond toute seule à la vérification.
3. Dans les champs du webhook, **abonnez-vous à `messages`**.
4. Passez l'application en mode **Live**, avec le bouton en haut de la page de l'application.

## Étape 7 — Test

1. Depuis un autre téléphone, écrivez « Bonjour, combien coûte l'abonnement ? » au +226 03 70 37 17. L'agent répond en quelques secondes.
2. Écrivez « je veux parler à un conseiller ». Vous devez recevoir un e-mail, et la conversation apparaît en rouge dans Admin → WhatsApp.

## Coûts

- **Meta :** les réponses aux personnes qui vous écrivent (dans les 24 h qui suivent leur message) sont en principe **gratuites** dans la tarification actuelle de Meta. Vérifiez sur la page « Pricing » de WhatsApp Business Platform. Seuls les messages que **vous** initiez (modèles marketing) sont payants : l'agent n'en envoie pas.
- **IA :** une réponse courte coûte environ 10 à 20 FCFA. Elle est visible dans le tableau de bord (coût IA du jour et du mois). Les plafonds ci-dessus évitent toute dérive.

## Règle des 24 heures

WhatsApp n'autorise les réponses libres que dans les **24 h** qui suivent le dernier message du client. L'agent répond toujours tout de suite. Si un conseiller répond depuis l'admin plus de 24 h après, Meta refuse l'envoi : le message d'erreur l'indique. Dans ce cas, répondez depuis l'application WhatsApp Business (coexistence) ou attendez que le client réécrive.
