# DREAD ROYAL pour Windows — gratuit, sans Internet, sans serveur

L'application s'installe sur **un ordinateur du salon** (Windows 10 ou 11, 64 bits).
Tout fonctionne sur cet ordinateur : l'interface, le serveur et la base de données PostgreSQL sont inclus.
**Aucun abonnement, aucun serveur, aucun nom de domaine, aucune connexion Internet nécessaires.**

## 1. Installer
1. Copier le fichier **`DREAD-ROYAL-Installation-1.0.0.exe`** sur l'ordinateur (clé USB, WhatsApp, e-mail…).
2. Double-cliquer dessus.
   - Si Windows affiche « **Windows a protégé votre ordinateur** » : cliquer sur **Informations complémentaires** puis **Exécuter quand même** (message normal pour un logiciel non signé par un éditeur payant).
3. Suivre l'assistant (en français) : un raccourci **DREAD ROYAL** est créé sur le Bureau.

## 2. Première ouverture
Au premier lancement (environ 20 secondes, le temps de créer la base de données), une fenêtre affiche :
- Identifiant : **proprietaire**
- Mot de passe provisoire : **DreadRoyal2026**

Vous devez immédiatement choisir **votre** mot de passe (8 caractères minimum, lettres et chiffres). Notez-le en lieu sûr.

Ensuite : **Paramètres → Salon** (adresse, téléphone, IFU), **Prestations** (vérifier les tarifs), **Personnel**, **Utilisateurs & rôles**, **Stock**, puis **Caisse → Ouvrir la caisse**.

> Si un message indique qu'un **composant Microsoft Visual C++** manque, l'application ouvre la page de téléchargement Microsoft : installez-le (gratuit), puis relancez DREAD ROYAL.

## 3. Sauvegardes — très important
- Automatiques **chaque jour à 13 h et 19 h** (si l'ordinateur est allumé), et à la demande : **Paramètres → Sauvegardes → Sauvegarder maintenant**.
- Elles sont dans **Documents\DREAD ROYAL\Sauvegardes** (menu **Fichier → Ouvrir le dossier des sauvegardes**).
- **Chaque semaine, copiez le dernier fichier sur une clé USB** (ou envoyez-le-vous par WhatsApp/e-mail). Si l'ordinateur tombe en panne ou est volé, c'est votre seule copie.
- **Restaurer** (après une erreur grave ou sur un nouvel ordinateur) : installer DREAD ROYAL, copier le fichier de sauvegarde dans le dossier des sauvegardes, puis **Paramètres → Sauvegardes → Restaurer**. L'état actuel est sauvegardé automatiquement avant.

## 4. Utiliser l'application depuis les téléphones du salon (facultatif, gratuit)
Les employés peuvent utiliser leur téléphone **sur le même Wi-Fi** que l'ordinateur :
1. Sur l'ordinateur : menu **Fichier → Accès depuis les téléphones (Wi-Fi du salon)** ; l'application redémarre. Si Windows le demande, autoriser l'accès sur les **réseaux privés**.
2. Menu **Fichier → Adresse pour les téléphones** : par ex. `http://192.168.1.20:4777`.
3. Sur le téléphone, ouvrir cette adresse dans **Chrome** et se connecter avec son propre compte.

L'ordinateur doit rester allumé avec DREAD ROYAL ouvert. Conseil : configurer la box pour que l'ordinateur garde toujours la même adresse.

## 5. Bon à savoir
- Les données sont dans `C:\ProgramData\DreadRoyal` (ne pas supprimer ce dossier). Désinstaller l'application **ne supprime pas** les données.
- Fermer DREAD ROYAL normalement (croix ou Fichier → Quitter) : la base s'arrête proprement. Après une coupure de courant, l'application redémarre normalement.
- Une seule fenêtre DREAD ROYAL peut être ouverte à la fois sur l'ordinateur.
- Journal technique (en cas de problème) : menu **Fichier → Journal technique**.

## 6. Et plus tard, en ligne ?
Le jour où vous louerez un serveur (voir `docs/DEPLOIEMENT.md`), vos données pourront y être transférées : l'application Windows utilise la même base PostgreSQL et le même format que la version en ligne.

---
### Pour le développeur : construire l'installateur
```bash
cd apps/desktop && npm install
npm run dist:win      # → release/DREAD-ROYAL-Installation-<version>.exe (fonctionne sous Linux, sans wine)
npm run dist:linux    # paquet Linux identique, pour tester l'application empaquetée (utilisateur non root)
```
Tests réalisés : application empaquetée (Linux, même code et même processus) lancée sur une installation neuve — création de la base, migrations, connexion, changement de mot de passe, caisse, vente, facture PDF, sauvegarde, restauration depuis l'écran, redémarrage avec données conservées, arrêt propre de PostgreSQL. L'installateur Windows a été généré et son contenu vérifié (moteur Prisma Windows, PostgreSQL Windows, migrations, interface) mais **n'a pas pu être exécuté sur un vrai PC Windows** dans l'environnement de développement.
