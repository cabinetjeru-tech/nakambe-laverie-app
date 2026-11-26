# Mettre DREAD ROYAL en ligne — guide pas à pas

**Solution retenue** : un seul petit serveur (VPS) qui fait tout tourner avec Docker :

```
Internet ──HTTPS──▶ Caddy (site + certificat gratuit Let's Encrypt)
                        ├── /        → application (PWA, installable)
                        └── /api/*   → API NestJS ──▶ PostgreSQL 16 (non exposé)
                                              └── sauvegardes nocturnes → deploy/backups/
```

**Coût indicatif** : serveur ≈ 4 à 6 €/mois (≈ 2 600 à 4 000 FCFA) + nom de domaine ≈ 10 à 15 €/an.
Les prix changent : vérifiez-les chez l'hébergeur au moment de commander.

---

## Étape 1 — Louer le serveur (15 min)
Choisir un VPS **Ubuntu 24.04**, **2 vCPU / 4 Go de RAM** minimum (2 Go possibles : le script ajoute de la mémoire d'échange). Exemples d'offres adaptées :
- **Hetzner Cloud** — CX22 (datacenter en Allemagne ou Finlande)
- **Contabo** — Cloud VPS 10 (Europe)
- **OVHcloud** — VPS Starter/Value (France)

Paiement : carte Visa/Mastercard — une carte virtuelle prépayée (proposée par Orange Money ou votre banque) convient.
À la commande, choisir **Ubuntu 24.04** ; vous recevez **l'adresse IP** du serveur et le mot de passe `root` (ou ajoutez votre clé SSH).

## Étape 2 — Le nom de domaine (10 min)
Acheter un domaine (ex. `dreadroyal.com`) chez un registraire (OVH, Namecheap, Hostinger…) — ou utiliser un sous-domaine d'un domaine existant.
Dans la zone DNS, créer **un enregistrement A** :

| Type | Nom | Valeur |
|---|---|---|
| A | `gestion` (→ `gestion.dreadroyal.com`) | l'adresse IP du serveur |

La propagation prend de quelques minutes à quelques heures.

## Étape 3 — Récupérer le code sur le serveur (5 min)
Se connecter au serveur depuis un ordinateur : `ssh root@ADRESSE_IP` (Windows : PowerShell ou PuTTY).

Le dépôt GitHub étant **privé**, créer un jeton en lecture seule : GitHub → *Settings* → *Developer settings* → *Fine-grained tokens* → accès au seul dépôt `nakambe-laverie-app`, permission *Contents : Read-only*. Puis :
```bash
apt-get update && apt-get install -y git
git clone https://VOTRE_JETON@github.com/cabinetjeru-tech/nakambe-laverie-app.git
cd nakambe-laverie-app && git checkout <branche-fusionnée>   # ex. main une fois la Pull Request fusionnée
cd dread-royal/deploy
```

## Étape 4 — Installer (10 min, automatique)
```bash
./install.sh
```
Le script : ajoute de la mémoire d'échange si besoin, installe Docker, configure le pare-feu (SSH/80/443), **génère les secrets** (`.env`, jamais versionné), vérifie le DNS, construit et démarre l'application, puis affiche :
```
✅ DREAD ROYAL est en ligne : https://gestion.dreadroyal.com
   Identifiant : proprietaire
   Mot de passe provisoire : ••••••••••
```
**Notez ce mot de passe**, connectez-vous et choisissez votre mot de passe définitif (demandé automatiquement).

## Étape 5 — Premiers réglages dans l'application
1. **Paramètres → Salon** : adresse, téléphone, IFU, RCCM (imprimés sur les factures).
2. **Paramètres → Trésorerie** : date de démarrage et soldes de départ (espèces, Orange Money, Moov Money, banque).
3. **Prestations** : vérifier/ajuster les tarifs.
4. **Personnel** puis **Utilisateurs & rôles** : un compte par employé (lié à sa fiche pour les coiffeurs).
5. **Stock** : produits et quantités ; **Caisse** : ouvrir la première session.
6. Sur chaque téléphone/ordinateur : ouvrir l'adresse dans Chrome → menu ⋮ → **« Installer l'application »**.

> ⚠️ Ne lancez **pas** les données de démonstration sur ce serveur.

---

## Exploitation au quotidien
| Besoin | Commande (dans `dread-royal/deploy`) |
|---|---|
| État des services | `docker compose ps` |
| Journaux de l'API | `docker compose logs -f api` |
| Sauvegarde immédiate | `./backup.sh` |
| Restaurer une sauvegarde | `./restore.sh backups/<fichier>.dump` (confirmation demandée, état actuel sauvegardé avant) |
| Mettre à jour l'application | `./update.sh` (sauvegarde → `git pull` → reconstruction ; migrations automatiques) |
| Redémarrer | `docker compose restart` |

**Sauvegardes** : automatiques chaque nuit à 02:00 (30 conservées) dans `deploy/backups/`, téléchargeables aussi depuis **Paramètres → Sauvegardes**. Une sauvegarde restée sur le serveur ne protège pas d'une panne du serveur : **téléchargez-en une copie au moins une fois par semaine** (clé USB, Google Drive) ; l'option « snapshots/backups » de l'hébergeur (≈ 1 €/mois) est recommandée.

## Application Android
Compiler l'APK avec l'adresse définitive (voir `docs/ANDROID.md`) :
```bash
cd apps/web && echo "NEXT_PUBLIC_API_URL=https://gestion.dreadroyal.com/api" > .env.local && npm run cap:sync
```

## Sécurité mise en place
- HTTPS obligatoire (redirection automatique), en-têtes de sécurité (HSTS, nosniff…).
- Base de données **non exposée** sur Internet ; secrets générés aléatoirement, fichier `.env` en accès root uniquement.
- Pare-feu : seuls SSH, HTTP et HTTPS ouverts.
- Conseillé : se connecter en SSH par clé et désactiver le mot de passe root.

## Ce qui a été testé
La pile complète (`docker-compose.yml`) a été construite et exécutée avec Docker : migrations et données de base au démarrage, HTTPS servi par Caddy, redirection HTTP → HTTPS, pages et liens profonds, connexion et changement de mot de passe, ouverture de caisse, création d'un collaborateur, vente complète, facture PDF, sauvegarde `pg_dump` depuis l'application, `backup.sh`, restauration (`restore.sh`) vérifiée. Le script `install.sh` a été vérifié syntaxiquement mais pas exécuté sur un VPS réel ; l'obtention du certificat Let's Encrypt nécessite un vrai domaine et ne pouvait pas être testée.
