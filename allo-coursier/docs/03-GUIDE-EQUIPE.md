# ALLÔ-COURSIER — Guide de l'équipe

Ce guide explique le travail quotidien dans l'administration (`/admin`). Chaque membre ne voit que les menus
autorisés par son rôle.

## Chaque matin

1. **Tableau de bord** : les encadrés orange signalent ce qui attend une action : paiements à vérifier,
   livreurs à valider, réclamations, retraits.
2. **Carte en direct** : vérifiez que des livreurs sont en ligne dans chaque ville.

## Commandes

- Une commande est d'abord proposée **automatiquement** au livreur disponible le plus proche. Il a
  30 secondes pour accepter. S'il refuse ou ne répond pas, le livreur suivant est sollicité.
- Si personne n'accepte, l'équipe reçoit une alerte **« Commande sans livreur »**. Ouvrez la commande et
  cliquez sur **Affecter un livreur**. Un point vert 🟢 signale les livreurs en ligne.
- **Relancer la recherche** retire le livreur actuel (injoignable, panne…) et cherche un autre livreur.
- **Corriger le statut** sert quand le livreur n'a pas pu valider dans l'application, par exemple quand
  le destinataire a perdu son code. Indiquez toujours la justification.
- **Annuler** rembourse automatiquement sur le portefeuille du client ce qu'il avait déjà payé.

## Paiements Mobile Money (sans contrat opérateur)

Le client envoie l'argent sur le numéro Orange Money ou Moov Money de l'entreprise, puis saisit la
référence reçue par SMS.

1. Menu **Paiements**, filtre « En attente ».
2. Pour chaque ligne, **vérifiez sur le téléphone ou le relevé de l'entreprise** que le montant a bien été
   reçu avec cette référence.
3. Si c'est bon, cliquez sur **Argent reçu — valider**. La commande part aussitôt à la recherche d'un
   livreur, ou le portefeuille du client est crédité.
4. Sinon, **refusez** en indiquant le motif. Le client est prévenu et peut corriger.

Une commande en attente de paiement est annulée automatiquement au bout de 60 minutes sans paiement
déclaré. Ce délai se règle dans les Paramètres.

## Espèces des livreurs

- Quand un client paie en espèces, le livreur garde **son gain**. Il doit reverser la **part de la
  plateforme** : la commission pour un indépendant, la totalité pour un salarié.
- Menu **Livreurs** → fiche du livreur → **Espèces et solde** : quand il remet l'argent, saisissez le
  montant reçu puis **Encaisser**.
- Au-delà du plafond (25 000 FCFA par défaut, réglable pour chaque livreur), un livreur ne reçoit plus de
  missions tant qu'il n'a pas versé.

## Retraits des livreurs indépendants

Quand des clients ont payé par portefeuille ou Mobile Money, la plateforme doit leurs gains aux livreurs.
Ceux-ci demandent un retrait depuis leur application.

1. Menu **Finances** → **Retraits livreurs**.
2. Envoyez l'argent par Mobile Money au numéro indiqué.
3. Saisissez la référence du transfert, puis cliquez sur **Payé**.

## Livreurs

- **Inscription d'un indépendant** : il s'inscrit depuis `/livreur/inscription` et envoie la photo de ses
  documents. Vérifiez chaque document (**Valider** ou **Refuser** avec motif). Rencontrez-le si besoin,
  puis cliquez sur **Valider l'inscription**.
- **Salarié** : bouton **Ajouter un livreur**. Un code secret provisoire s'affiche une seule fois :
  communiquez-le au livreur.
- **Suspendre** met le livreur immédiatement hors ligne.

## Clients

- Un client a oublié son code : fiche client → **Générer un nouveau code secret**, puis communiquez-le.
- **Suspendre** bloque l'accès au compte, en cas d'abus par exemple.

## Réclamations

Répondez depuis la fiche de la réclamation. Une **note interne** reste invisible pour le client. Un
**geste commercial** crédite le portefeuille du client ; il nécessite le droit de valider les paiements.

## Tarifs et promotions

- **Tarifs** : une modification ne s'applique qu'aux **nouvelles** commandes. Testez-la d'abord avec le
  simulateur.
- **Promotions** : un code promo réduit les frais de livraison. La remise est payée par la plateforme : le
  gain du livreur reste inchangé.

## Sécurité

- Ne communiquez jamais votre mot de passe. Chaque action sensible est enregistrée dans le **Journal
  d'audit** avec son auteur.
- Ne demandez **jamais** à un client son code secret Mobile Money ni son code Allô-Coursier.
