# Veritrace

**Assistant de forensique Android pour examens légalement autorisés.**
Développé par **Nourou Chafikou**.

Veritrace automatise l'acquisition logique, le parsing multi-outils, la corrélation et la
rédaction des rapports. Il s'appuie sur ADB, ALEAPP, MVT et Autopsy, et fait passer tous
les modules par un **contrat de données JSON unique**. Les rapports judiciaire et entreprise
sont générés depuis ce même JSON, en PDF et en Markdown.

> ⚠️ **Usage strictement encadré.** Veritrace ne s'utilise que dans le cadre d'un examen
> autorisé (consentement écrit du titulaire ou mandat). Il **ne contient aucune fonction de
> contournement** d'écran de verrouillage, de mot de passe ou d'authentification, et n'en
> contiendra pas.

---

## État d'avancement

| Module | État |
|---|---|
| Squelette, CLI `veritrace`, bannière, `--version` | ✅ |
| Garde-fou d'autorisation légale (bloquant) | ✅ |
| Journal d'audit horodaté, chaîné, en lecture seule | ✅ |
| Dossier d'affaire normalisé (`case init`) | ✅ |
| Format pivot (draft-07) + validateur + exemple | ✅ *(bloc `case` du promoteur ; autres sections complétées, à valider)* |
| Reporting judiciaire / entreprise, PDF + Markdown | ✅ |
| Détection des outils externes (`doctor`) | ✅ |
| Acquisition ADB : fiche appareil, getprop, applications, dumpsys, backup, pull ciblé, bugreport, custody automatique (`veritrace acquire`) | ✅ |
| Wrappers ALEAPP / MVT / Autopsy (`veritrace parse …`) | ✅ |
| Corrélation inter-outils : corroboration, dédoublonnage, timeline (`veritrace correlate`) | ✅ |
| Règles de détection d'anomalies R1–R6 (`veritrace rules …`) | ✅ |
| Parseurs natifs Veritrace : SMS/MMS, appels, contacts, navigation, EXIF/GPS, dumpsys package/accessibility (`veritrace parse sqlite`) | ✅ |
| Messageries tierces : WhatsApp, Viber, Facebook Messenger (natif + ALEAPP), Telegram (ALEAPP), Signal (détection) | ✅ |
| Distribution : exécutables autonomes Windows / Linux / macOS, paquet Python, `veritrace selftest`, CI 3 OS, publication automatisée | ✅ *(exécutable Linux vérifié ici ; Windows et macOS construits et testés par la CI)* |
| Récupération des enregistrements supprimés SQLite : WAL, journal, pages et blocs libres (`veritrace parse recover`) | ✅ *(testée sur des bases synthétiques ; à valider sur appareil réel)* |

---

## Installation

> **Utilisateurs** : suivez le guide **[GUIDE_UTILISATEUR.md](GUIDE_UTILISATEUR.md)**. Il
> couvre le téléchargement de l'exécutable autonome, l'installation en un clic sous
> Windows, `veritrace selftest` et le dépannage.

| Mode | Pour qui | Python requis |
|---|---|---|
| Exécutable autonome `veritrace-<version>-<plateforme>.zip` (Windows x64, Linux x64, macOS arm64) | postes d'examen | non |
| Paquet `veritrace-<version>-py3-none-any.whl` (`pip` / `pipx`, options `[exif]`, `[all]`) | postes avec Python | ≥ 3.10 |
| Sources (`pip install -e ".[dev]"`) | développement | ≥ 3.10 |

Après l'installation : `veritrace selftest`, qui rejoue la chaîne complète sur des données
fictives, puis `veritrace doctor`, qui indique les outils externes présents et où obtenir
les autres.

### Publier une version (mainteneur)

1. Mettre à jour `veritrace/__init__.py` (`__version__`) et `CHANGELOG.md`.
2. Poser l'étiquette : `git tag veritrace-v0.2.0 && git push origin veritrace-v0.2.0`.
3. Le workflow `.github/workflows/veritrace-release.yml` effectue alors :
   - la construction de l'exécutable pour chaque plateforme (PyInstaller) ;
   - son **autotest** ;
   - l'assemblage des archives : exécutable, scripts d'installation, guide, licence ;
   - la construction du paquet Python ;
   - la création de la version GitHub, avec `SHA256SUMS.txt`.

Construction locale d'un exécutable :
`pip install ".[dev]" && cd packaging && pyinstaller veritrace.spec --noconfirm && cd .. && python packaging/bundle.py linux-x64`.

Les exécutables ne sont **pas signés** : SmartScreen (Windows) ou Gatekeeper (macOS)
affiche un avertissement. Pour le supprimer, il faut un certificat de signature de code
au nom du cabinet ; il s'ajoute ensuite à l'étape de construction.

### 1. Veritrace depuis les sources

Python ≥ 3.10.

```bash
cd veritrace
python -m venv .venv && source .venv/bin/activate   # Windows : .venv\Scripts\activate
pip install -e ".[dev]"
veritrace --version
```

### 2. Outils externes

Ces outils sont **optionnels**. S'il en manque un, Veritrace affiche un avertissement et
consigne l'étape comme « non exécutée » (`ignore`) dans l'affaire et dans le rapport. Il
ne plante pas. Pour faire le point :

```bash
veritrace doctor
```

Chaque outil est cherché dans le `PATH`. Pour imposer un chemin, utilisez la variable
d'environnement indiquée. Il est conseillé d'installer **chaque outil dans son propre
environnement virtuel**, car leurs dépendances entrent en conflit entre elles.

#### ADB (Android SDK Platform-Tools)
Rôle : acquisition logique (`veritrace acquire`).
1. Télécharger *SDK Platform-Tools* sur developer.android.com/tools/releases/platform-tools.
2. Décompresser l'archive et ajouter le dossier au `PATH`.
3. Sous Linux, installer aussi les règles udev Android (Debian/Ubuntu : paquet `android-sdk-platform-tools-common`).
4. Vérifier avec `adb version`. Variable : `VERITRACE_ADB`.

#### ALEAPP
Rôle : parsing complet de l'extraction logique.
```bash
git clone https://github.com/abrignoni/ALEAPP.git
python -m venv venv-aleapp
venv-aleapp/bin/pip install -r ALEAPP/requirements.txt
export VERITRACE_ALEAPP=$PWD/ALEAPP/aleapp.py
export VERITRACE_ALEAPP_PYTHON=$PWD/venv-aleapp/bin/python   # interpréteur qui exécute aleapp.py
```
Si vous utilisez un binaire ALEAPP empaqueté, placez-le dans le `PATH` sous le nom `aleapp`
(ou pointez `VERITRACE_ALEAPP` dessus).

#### MVT (Mobile Verification Toolkit)
Rôle : détection de spyware et de stalkerware par IOC.
```bash
python -m venv venv-mvt
venv-mvt/bin/pip install mvt
export VERITRACE_MVT=$PWD/venv-mvt/bin/mvt-android
```
Les IOC se fournissent au format **STIX2** avec `--iocs fichier.stix2` (option répétable),
par exemple ceux du projet *stalkerware-indicators* ou des rapports d'Amnesty Tech.
Veritrace lance MVT **sans téléchargement automatique d'IOC** (`--disable-indicator-update-check`) :
seuls les fichiers fournis explicitement sont utilisés, et ils sont copiés et hachés dans
l'affaire.

#### Autopsy
Rôle : intégration du résultat de l'ingest Android.
- Windows : installeur MSI sur sleuthkit.org/autopsy.
- Linux / macOS : installer The Sleuth Kit (Java), puis lancer le script `unix_setup.sh`
  livré dans l'archive Autopsy.
- Dans Autopsy, lancer l'ingest avec le module **Android Analyzer** sur l'extraction. On
  peut ensuite transmettre à Veritrace le dossier du cas, ou un **Portable Case** exporté
  (*Tools › Generate Portable Case*).
- **Autopsy n'a pas besoin d'être installé sur le poste Veritrace.** Veritrace lit la base
  `autopsy.db` du cas, en lecture seule.

### 3. Versions testées

| Composant | Version | Comment |
|---|---|---|
| Python | 3.11.15 | |
| click / jsonschema / reportlab | 8.4.2 / 4.26.0 / 5.0.1 | |
| **ALEAPP** | **2026.4.2** (commit `82aec26`) | Exécuté par Veritrace sur une extraction Android synthétique. La sortie réelle (LAVA + TSV) est conservée dans `tests/fixtures/aleapp_2026.4.2`. |
| **MVT** | **2026.9.28** | Exécuté par Veritrace (`check-androidqf`, IOC STIX2). La sortie réelle est conservée dans `tests/fixtures/mvt_2026.9.28`. |
| **Autopsy** | **non testé avec une installation réelle** | Lecteur écrit d'après le schéma de base Sleuth Kit (tables *blackboard*) et testé sur une base synthétique conforme (schéma 9.4). **À valider sur un cas produit par Autopsy 4.21+ avant usage en production.** |
| Pillow (EXIF) | 12.3.0 | Facultatif : sans Pillow, l'analyse EXIF est signalée comme non effectuée. |
| ADB | **non testé avec un appareil réel** | Module testé avec un `adb` simulé qui reproduit les sorties réelles (`tests/fixtures/fake_adb.py`) : appareil autorisé, non autorisé, absent, multiple, sauvegarde refusée ou chiffrée. **À valider sur un appareil réel (Platform-Tools 35+) avant usage en production.** |

Pour relancer les tests avec les vrais outils :
`VERITRACE_ALEAPP=… VERITRACE_ALEAPP_PYTHON=… VERITRACE_MVT=… python -m pytest -k real`

---

## Garde-fous

### Confirmation d'autorisation (bloquante)
Chaque commande, sauf `--help` et `--version`, commence par cette séquence :

1. nom de l'examinateur ;
2. base légale : `consentement`, `mandat`, `ordre_judiciaire` ou `politique-entreprise` ;
3. référence du document (n° de mandat, PV de consentement…) ;
4. saisie exacte de `AUTORISATION VERIFIEE`.

Si une étape échoue, ou si l'entrée est vide, la commande s'arrête avec le code de sortie 3
sans rien avoir exécuté. Il n'existe **aucun drapeau de contournement**. Un test vérifie que
chaque commande de la CLI passe par ce garde-fou.

En mode scripté, les réponses doivent être fournies explicitement sur l'entrée standard :

```bash
printf 'Nom Prénom\nmandat\nCR-2026-118\nAUTORISATION VERIFIEE\n' | veritrace report --case ./VT-2026-0042
```

### Journal d'audit
- Le format est JSONL, une ligne par action : `seq`, horodatage UTC à la microseconde,
  examinateur, action, détails, `prev_hash`, `entry_hash` (SHA-256 chaîné).
- Le code ne permet que l'ajout. Entre deux écritures, le fichier repasse en lecture seule (0444).
- `veritrace audit verify [--case DIR]` détecte toute ligne modifiée, supprimée ou réordonnée.
- L'empreinte de tête du journal est recopiée dans le JSON normalisé et imprimée dans les
  rapports. On peut ainsi détecter une troncature après coup.
- Il y a deux journaux : celui du poste (`~/.veritrace/audit.jsonl`, déplaçable avec
  `VERITRACE_HOME`) et celui de chaque affaire (`<affaire>/audit/audit.jsonl`).
- Limite assumée : un logiciel peut rendre une altération *détectable*, il ne peut pas la
  rendre *impossible* face à un administrateur du poste. Pour une garantie forte, archivez le
  journal sur un support WORM et transmettez l'empreinte de tête avec le rapport.

---

## Dossier d'affaire

```
<AFFAIRE>/
├── normalized/veritrace_case.json   ← contrat de données (source unique des rapports)
├── acquisition/raw/<ACQ-ID>/        ← données brutes collectées (ne jamais modifier)
├── parsed/<outil>/                  ← sorties brutes d'ALEAPP, MVT, Autopsy…
├── custody/documents/               ← PV, consentement, mandat
├── reports/                         ← rapports + manifestes (empreintes)
├── assets/                          ← logo du cabinet
├── audit/audit.jsonl                ← journal d'audit chaîné
└── logs/veritrace.log               ← logs techniques
```

---

## Contrat de données : le format pivot

Tous les modules passent par un **format pivot unique** :
`veritrace/schema/veritrace_pivot.schema.json` (JSON Schema **draft-07**). Les trois
wrappers écrivent dans ce format et les deux rapports ne lisent que lui.

| Partie | Origine |
|---|---|
| `case` (`case_id`, `title`, `examiner`, `created_at`, `authorization{type, reference, confirmed_by, confirmed_at}`) | **Bloc du promoteur, repris tel quel**, avec la valeur `politique-entreprise` ajoutée à `authorization.type` |
| `device`, `acquisitions`, `artifacts`, `findings`, `timeline`, `chain_of_custody` | **Complété par Veritrace** dans le même style, marqué « A VALIDER » dans le schéma (`$comment`) |
| `x_veritrace` (à la racine et dans chaque objet) | Extensions propres à Veritrace, toujours **facultatives** : un document sans `x_veritrace` reste conforme |

Structure résumée :

```text
case                 affaire + autorisation légale (bloquante)
device               UN appareil par affaire (fabricant, modèle, os_version, IMEI, série…)
acquisitions[]       chaque entrée de données : méthode ADB ou « import » (extraction, base Autopsy, IOC)
  └ items[]          éléments de preuve hachés à la collecte (item_id, chemin, sha256…)
artifacts[]          faits extraits : category, timestamp, source{tool, item_id, fichier, enregistrement},
                     data, sha256 (contenu), corroborated, corroborated_by
findings[]           constats : type, severity (critique/eleve/moyen/faible/info), description (faits),
                     artifact_ids, item_ids, corroborated, ioc{type, value, source, family}
timeline[]           événements datés, reliés aux artefacts
chain_of_custody[]   qui, quoi (item_id, action), quand, empreinte
```

Les valeurs d'énumération sont en français ASCII, comme dans le bloc fourni (`ordre_judiciaire`) :
- catégories : `sms`, `appel`, `contact`, `navigation`, `localisation`, `exif`, `usage_app`, `application`, `wifi`, `bluetooth`, `compte`, `ioc`, `autre` ;
- actions de custody : `collecte`, `verification`, `copie`, `analyse`… ;
- statuts : `succes`, `partiel`, `echec`, `ignore`.

Extensions `x_veritrace` :
- dans l'affaire : cabinet et logo, mission, synthèse, limites, fuseau d'affichage ;
- dans les artefacts : empreinte de fait (`fact_sha256`), moteur, sources de corroboration ;
- dans les constats : interprétation, résumé non technique, remédiation, pièces ;
- à la racine : exécutions d'outils et intégrité.

Validation, en deux temps :
- **Structure** : draft-07.
- **Sémantique** :
  - unicité des identifiants ;
  - intégrité référentielle (artefact → élément de preuve, constat → artefacts/éléments, custody → élément) ;
  - empreintes de custody identiques à celle de l'élément, et une « collecte » pour chaque élément ;
  - `sha256` de chaque artefact cohérent avec ses données ;
  - `corroborated` vrai **si et seulement si** au moins deux moteurs indépendants ont extrait le fait ;
  - dates valides avec fuseau ;
  - avec `--case-root`, re-hachage des éléments sur disque.
- **Sorties de wrappers** : un test vérifie que chacune (`parsed/<outil>/RUN-*/veritrace_normalized.json`) est conforme aux définitions `artifact` et `finding` du schéma.

Exemple complet (affaire fictive) : `veritrace/schema/examples/example_case.json`.
Pour utiliser une autre version du schéma : `VERITRACE_SCHEMA=/chemin/schema.json`.

```bash
veritrace schema validate mon_affaire.json [--case-root ./VT-2026-0042]
veritrace schema example -o exemple.json
```

---

## Acquisition ADB

Prérequis côté appareil, **tous réalisés par le titulaire** :
- appareil allumé et déverrouillé par lui ;
- débogage USB activé ;
- demande « Autoriser le débogage USB ? » acceptée pour le poste.

```bash
veritrace acquire devices                                   # appareils vus et leur état
veritrace acquire run --case ./VT --imei 35xxxxxxxxxxxxx --seal SC-0042 --owner "…" \
                      --method packages --method dumpsys --method backup     # défaut
veritrace acquire run --case ./VT --method pull --path /sdcard/DCIM --path /sdcard/Download
veritrace acquire run --case ./VT --method bugreport        # pour MVT check-bugreport
```

Déroulé :
1. Veritrace vérifie l'état ADB de l'appareil. Si l'appareil est `unauthorized`,
   `offline`, en recovery, ou si plusieurs appareils sont branchés, il **s'arrête** et
   explique ce que le titulaire doit faire. Aucun contournement n'est tenté.
2. Il affiche le profil de l'appareil (fabricant, modèle, Android, correctif, n° de série)
   à côté de l'autorisation, et l'examinateur doit confirmer **« oui »** que c'est bien
   l'appareil visé.
3. Chaque méthode produit une acquisition `ACQ-nn` :

| Méthode | Commande ADB | Collecté |
|---|---|---|
| (toujours) | `shell getprop` | `getprop.txt` + fiche appareil |
| `packages` | `shell pm list packages -f -i -U` | `packages.txt` |
| `dumpsys` | `shell dumpsys <service>` (package, usagestats, account, wifi, bluetooth_manager, location, appops) | un fichier par service |
| `backup` | `backup -all -noapk [-shared]` | `backup.ab` + `backup.tar` dérivé (si non chiffré) |
| `pull` | `pull -a <chemin>` | un dossier par chemin, avec un manifeste `sha256sum` |
| `bugreport` | `bugreport` | `bugreport-*.zip` |

4. Chaque élément est **haché (SHA-256) dès son écriture** et passé en lecture seule. Un
   événement de custody « collected » consigne qui, quoi, quand, où et l'empreinte. Le
   journal des commandes ADB (`adb.log`) est lui aussi collecté comme preuve. L'affaire est
   sauvegardée après chaque méthode, si bien qu'une interruption ne fait rien perdre.

Garde-fous techniques :
- Le client ADB refuse, avant tout envoi, les commandes `su`, `root`, `input`/`keyevent`,
  `locksettings`, `setprop`, `reboot`, `remount`, `install`… Un test vérifie qu'elles
  n'atteignent jamais `adb`.
- L'IMEI n'est **pas** extrait par des moyens détournés : l'examinateur le relève
  (étiquette, `*#06#` affiché par le titulaire) et le saisit avec `--imei`.
- Pour une sauvegarde chiffrée, Veritrace ne tente aucune récupération de mot de passe.
  Si le titulaire a communiqué le mot de passe, il se donne à MVT (`check-backup -p`).

Limites :
- Depuis Android 12, `adb backup` ne couvre que les applications qui l'autorisent ;
  Veritrace le signale dans l'acquisition.
- `pull` n'accède qu'au stockage partagé (`/sdcard`) : les fichiers protégés sont
  signalés comme une copie partielle.
- Les sauvegardes `.ab` s'analysent avec `veritrace parse mvt --input …/backup.ab`. La
  couverture d'ALEAPP sur l'arborescence d'une sauvegarde (`apps/<paquet>/…`) est limitée.

---

## Analyse multi-outils

Les trois wrappers partagent la même interface (`parsing/base.py`). L'**entrée** est le
chemin de l'extraction. La **sortie** est du JSON normalisé, versé dans le dossier d'affaire.

```bash
veritrace parse aleapp  --case ./VT --input ./extraction            # lance ALEAPP (parsing complet)
veritrace parse sqlite  --case ./VT --input ./extraction            # parseurs natifs (sans outil externe)
veritrace parse sqlite  --case ./VT --input ./VT/acquisition/raw/ACQ-03   # dumpsys collectés par acquire
veritrace parse recover --case ./VT --input ./extraction            # enregistrements supprimés (SQLite)
veritrace parse mvt     --case ./VT --input ./androidqf --iocs stalkerware.stix2
veritrace parse autopsy --case ./VT --input ./CasAutopsy --autopsy-version 4.21.0
veritrace parse all     --case ./VT --input ./extraction --mvt-input ./androidqf \
                        --iocs stalkerware.stix2 --autopsy-case ./CasAutopsy
veritrace correlate     --case ./VT                                 # recalcul seul
```

Pour chaque outil, Veritrace enchaîne les étapes suivantes :

1. **Preuve** : l'extraction est enregistrée et hachée. Pour un dossier, un manifeste
   `sha256sum` est écrit dans `custody/manifests/`. Avant chaque nouvelle analyse,
   l'empreinte est **recalculée**. Si l'extraction a changé, l'analyse est refusée.
2. **Exécution ou import** : on peut lancer l'outil, ou importer une sortie existante avec
   `--from-output`, par exemple si l'outil tourne sur un autre poste. La sortie brute est
   conservée dans `parsed/<outil>/<RUN-ID>/` et son empreinte est consignée.
3. **Normalisation** : le résultat est écrit au schéma commun dans
   `parsed/<outil>/<RUN-ID>/veritrace_normalized.json`, puis fusionné dans l'affaire.
   Relancer un outil ne crée pas de doublons.
4. **Corrélation**, validation, sauvegarde et journal d'audit.

| Outil | Ce qui est normalisé |
|---|---|
| **veritrace-sqlite** (natif, toujours disponible) | Bases Android lues directement : `mmssms.db` (SMS/MMS), `calllog.db` / `contacts2.db` (appels, contacts), `History` de Chrome / Samsung Internet / Opera / WebView. Photos JPEG (DCIM, Pictures…) : EXIF, plus une localisation GPS horodatée en UTC. `dumpsys package` : installateur, statut système, permissions accordées. `dumpsys accessibility` : services d'accessibilité **activés**. Entrées acceptées : dossier, `.tar` / `.zip`, **y compris le tar d'une sauvegarde ADB** (`apps/<paquet>/…`). Les bases sont ouvertes sur une **copie de travail**, avec le journal WAL rejoué (les originaux ne sont jamais ouverts en écriture). Les enregistrements supprimés relèvent de `veritrace-recover` (ci-dessous). |
| ALEAPP | Lit la sortie LAVA (`_lava_data.lava` + `_lava_artifacts.db`), ou les TSV pour les versions antérieures. Catégories : SMS/MMS, appels, contacts, historique web, localisations, applications installées, usage des applications (événements), comptes, Wi-Fi, Bluetooth. Les artefacts non couverts sont listés dans le rapport et restent dans la sortie brute. |
| MVT | Mode détecté automatiquement (AndroidQF, sauvegarde `.ab`, bugreport) ; si le format n'est pas reconnu, Veritrace le signale au lieu de deviner. **Chaque détection d'IOC devient un constat de type `ioc`, de criticité `critique` (alerte MVT CRITICAL) ou `eleve` (autres niveaux)**, avec le bloc `ioc` (type, valeur, fichier d'IOC, famille). Les alertes heuristiques MEDIUM ou plus deviennent des constats « application suspecte ». Les applications installées servent à la corroboration. |
| Autopsy | Lit `autopsy.db` (cas, Portable Case ou fichier `.db`). Seuls les artefacts du **module Android** sont retenus (option `--module` pour en ajouter d'autres). |

### Messageries tierces

Les messages des messageries tierces forment la catégorie `message` du format pivot. Le
contenu de `data` est le suivant :
- l'application ;
- la direction ;
- la conversation, avec un indicateur de groupe ;
- l'expéditeur (identifiant et nom) ;
- le texte, conservé **tel quel** ;
- le type (texte, image, audio, localisation…) ;
- la pièce jointe et l'éventuelle position.

Les appels et les contacts de ces applications réutilisent `appel` et `contact`, avec un
champ `app` (`null` = téléphonie et carnet Android).

| Application | Moteur natif | ALEAPP | Corroboration |
|---|---|---|---|
| **WhatsApp** / WhatsApp Business (`msgstore.db`, `wa.db` ; schémas moderne et historique) | messages, appels, contacts | messages, appels, contacts | ✅ deux moteurs |
| **Viber** (`viber_messages`, `viber_data`) | messages, appels, contacts | messages, appels, contacts | ✅ |
| **Facebook Messenger** (`threads_db2`) | messages | messages | ✅ |
| **Telegram** (`cache4.db`, messages sérialisés TL) | — | messages (décodage TL d'ALEAPP) | source unique |
| **Signal** (`signal.db`) | détection seulement | messages seulement si les clés de déchiffrement sont fournies à ALEAPP | — |

Contenus présents mais **non analysables**, consignés automatiquement dans les **limites
et réserves** du rapport (`case.x_veritrace.limitations`). Veritrace ne tente aucun
déchiffrement :
- la base Signal, chiffrée par SQLCipher avec une clé protégée par le Keystore Android ;
- les sauvegardes WhatsApp chiffrées `msgstore*.db.cryptNN` (stockage partagé).

Points d'attention :
- **WhatsApp** et **Signal** excluent leurs données de `adb backup` : leurs bases ne figurent
  que dans une extraction de système de fichiers complète.
- **Les « canaux » WhatsApp** (`@newsletter`, contenus publics) ne sont pas comptés comme
  des conversations.
- **Empreinte de fait d'un message** : horodatage à la seconde, application, texte et nom
  de la pièce jointe. L'identifiant de conversation n'en fait pas partie, car chaque outil
  l'exprime différemment.

### Corroboration et dédoublonnage

- Chaque artefact porte une **empreinte de fait** (`x_veritrace.fact_sha256`), calculée sur ses seuls
  attributs identifiants (`schema/facts.py`). Par exemple : horodatage à la seconde,
  numéro et texte pour un SMS ; nom de paquet pour une application. Les champs
  secondaires, que chaque outil remplit différemment, n'entrent pas dans l'empreinte.
- **Dédoublonnage** : un fait extrait par ALEAPP et par Autopsy n'est compté **qu'une
  fois**. Il produit un seul événement de timeline, et les inventaires distinguent
  « faits uniques » et « enregistrements tous outils ». Chaque outil garde son artefact,
  pour la traçabilité.
- **Corroboration** : un fait extrait par **au moins deux moteurs indépendants** est
  marqué « Corroboré (fiabilité renforcée) » dans les rapports. Le module aLEAPP intégré
  à Autopsy a le moteur `ALEAPP` : il **ne corrobore pas** ALEAPP.
- Les constats IOC de MVT sont reliés automatiquement aux artefacts des autres outils qui
  décrivent le même élément : application installée, usage, visite du domaine.
- Choix prudent : en cas de doute, Veritrace ne fusionne pas deux faits. Une fausse
  corroboration serait plus grave qu'un doublon.

### Récupération des enregistrements supprimés (`veritrace-recover`)

`veritrace parse recover` (également lancé par `parse all`, sauf `--no-recover`) relit les
bases SQLite **octet par octet**, sans passer par SQLite, sur une copie en lecture seule
de la base et de ses fichiers `-wal` / `-journal`. Les originaux ne sont jamais ouverts.

| Emplacement examiné | Ce qu'il conserve | Fiabilité de lecture |
|---|---|---|
| Journal **WAL** : version de page du fichier principal masquée par une trame, trames anciennes | état de la page **avant** la suppression ou la modification | élevée (cellule intacte, identifiant de ligne connu) |
| Trames WAL **non validées** (après le dernier commit, ou génération antérieure du WAL) | écritures peut-être jamais validées | moyenne |
| **Journal de rollback** (`-journal`, y compris en mode PERSIST, en-tête remis à zéro) | images des pages avant la dernière transaction | élevée |
| **Pages libres** (feuilles et « troncs » de la liste des pages libres) | pages entières libérées | moyenne (table déduite de la structure) |
| **Espace non alloué** des pages de table (feuilles et pages intérieures) | anciennes cellules | élevée si cellule complète, sinon moyenne |
| **Blocs libres** (cellules supprimées) | cellule dont les 4 premiers octets sont écrasés | moyenne |

Bases prises en charge : `mmssms.db` (SMS), `calllog.db` / `contacts2.db` (appels),
`History` (Chrome, Samsung Internet, Opera, WebView), WhatsApp `msgstore.db` (messages,
appels ; schémas moderne et historique), Viber (messages, appels), Messenger `threads_db2`.
Contacts Android (`raw_contacts` / `data`, répartis sur plusieurs tables) : non récupérés.

Chaque enregistrement retrouvé est normalisé par **la même fonction** que les lignes actives
(`sqlite_native.map_*`), puis comparé aux données actives de la base :

- **fait identique** à une ligne active → écarté. C'est une copie ou une ancienne version
  sans différence significative, par exemple un SMS simplement passé à « lu » ;
- **même identifiant de ligne, contenu différent** → `version_anterieure`, par exemple le
  texte d'un message avant sa modification ;
- **sinon** → `absent` des données actives : supprimé, ou remplacé par une modification.

Garde-fous contre les faux positifs :
- signature stricte : nombre de colonnes et compatibilité de chaque valeur avec le type
  déclaré de sa colonne ;
- une cellule compatible avec **plusieurs** tables n'est attribuée à aucune ; elle est
  seulement comptée (`ambiguous`) ;
- textes lisibles exigés, et blocs entièrement nuls rejetés.

Mesure réalisée sur une base de 13 Mo : 60 000 SMS dont 20 000 supprimés, **19 996 retrouvés,
aucun faux positif**, en 7 s.

Dans le format pivot :
- l'artefact porte `x_veritrace.recovery` : statut, méthode, fiabilité, base, table, ligne
  et **tous les emplacements** (page, trame WAL, décalage) ;
- son empreinte de fait inclut le statut, si bien qu'il **ne corrobore jamais** un fait actif ;
- la timeline lui ajoute le drapeau `recupere` et la mention « [Récupéré] » ;
- le bilan par base (pages, WAL, journal, pages libres, effacement sécurisé constaté, nombre
  d'enregistrements récupérés) est consigné dans `x_veritrace.recovery` ;
- la règle **R6** groupe les enregistrements par base. Le rapport judiciaire présente la
  méthode au § 3.6 et la liste complète en annexe B.

**Limites (à lire avant toute conclusion) :**
- la bibliothèque SQLite d'Android est compilée avec l'**effacement sécurisé**
  (`SQLITE_SECURE_DELETE`), et les bases système sont en **auto-vacuum**. Dans ces bases,
  les cellules supprimées sont remises à zéro et les pages libérées tronquées. La
  récupération repose alors surtout sur le **WAL** et le **journal**, qu'il faut donc
  collecter avec la base. Veritrace détecte les blocs libres remis à zéro et l'indique
  dans les limites du rapport ;
- les applications qui embarquent leur propre SQLite peuvent se comporter autrement.
  Ce comportement est à vérifier application par application sur un appareil réel ;
- la **date de suppression n'est jamais connue**, seul l'horodatage de l'enregistrement
  l'est ;
- **l'absence de résultat ne prouve pas l'absence de suppression**.

---

## Règles de détection d'anomalies

Les règles s'exécutent automatiquement à chaque corrélation, c'est-à-dire après chaque
outil et lors de `veritrace correlate`. Elles ne lisent que le format pivot.

| Règle | Détecte | Criticité |
|---|---|---|
| **R1** | Application **non système** installée hors magasin officiel : aucun installateur déclaré (adb, installation sans trace), ou installateur de paquets / navigateur / gestionnaire de fichiers (APK manuel) | `moyen` ; `eleve` si ≥ 2 permissions sensibles (SMS, journal d'appels, localisation, micro, caméra, contacts, accessibilité…) |
| **R2** | Application de magasin cumulant un service d'accessibilité, d'écoute des notifications ou d'administration **et** ≥ 2 permissions de surveillance | `moyen` |
| **R3** | Visite d'une URL d'APK dans les 60 min précédant l'installation d'une application hors magasin | `eleve` |
| **R4** | Horodatages postérieurs de plus de 24 h au début de l'acquisition, ou antérieurs à Android (2008) : horloge modifiée, données altérées ou erreur de décodage | `moyen` |
| **R5** | Interruption de l'activité (SMS, appels, navigation, usage, localisation) > 72 h **et** > 10 × l'écart médian (au plus 3 signalées) | `faible` |
| **R6** | Enregistrements récupérés hors des données actives, par base : supprimés (`absent`) ou contenus antérieurs de lignes modifiées (`version_anterieure`, avec le contenu actuel en regard) | `moyen` pour les communications (SMS, messages, appels) ; `faible` sinon |

Garanties :
- **Format des constats** : les faits figurent dans `description` et l'interprétation dans
  `x_veritrace.interpretation`, rédigée prudemment, avec ses limites. Chaque constat est
  relié à ses artefacts, donc à des éléments de preuve hachés.
- **Prudence** : une application n'est signalée par R1 que si au moins une source
  indique **explicitement** qu'elle n'est pas système. ALEAPP le déduit du chemin
  d'installation : `/system/…` pour une application système, `/data/app/…` sinon. Les
  dates impossibles (R4) sont exclues du calcul des interruptions (R5).
- **Identifiants stables et régénération** : `F-R1-<empreinte>`. Les constats de règles
  sont recalculés à chaque corrélation, donc toujours à jour avec les données.
- **Revue par l'examinateur** : `veritrace rules review --case ./VT F-R1-… [--interpretation "…"]`
  fige le constat (il n'est plus régénéré ni supprimé). Dans les rapports, toute
  interprétation générée automatiquement par une règle ou par MVT est présentée comme
  « **proposée automatiquement — non revue par l'examinateur** » tant que le constat n'a
  pas été revu.
- **Traçabilité** : la liste des règles évaluées (version, paramètres, état, nombre de
  constats) est consignée dans `x_veritrace.rules_applied`. Elle est reprise dans le
  rapport judiciaire (§ 3.5) et dans le rapport entreprise.

```bash
veritrace rules list
veritrace rules config --case ./VT --disable R5 --gap-hours 48 --download-window-minutes 30
veritrace rules review --case ./VT F-R1-2f5fa2e88c --interpretation "Application de contrôle parental installée par le titulaire (déclaration au PV)."
```

Sources des informations utilisées par les règles :
- **Permissions** : ALEAPP (`runtime-permissions.xml`, magasin de permissions) et moteur
  natif (`dumpsys package` : permissions d'installation et d'exécution accordées).
- **Services d'accessibilité activés** : moteur natif (`dumpsys accessibility`, collecté par
  `veritrace acquire`). Ils comptent comme capacité de contrôle (R2) et comme accès
  sensible (R1).

---

## Rapports

Le gabarit se choisit avec `--report judiciaire` ou `--report entreprise`. Les deux sont
exportés en PDF et en Markdown à partir du même JSON.

### Modèle judiciaire (recevable en justice)

| Partie | Contenu |
|---|---|
| Page de garde | Logo et coordonnées du cabinet, n° d'affaire, autorité requérante, examinateur(s), dates (ouverture, période des opérations, rapport), appareil (marque, modèle, IMEI, système), empreinte des données sources |
| 1. Déclaration d'autorisation | Base légale, référence du consentement ou du mandat, émetteur, date, périmètre, empreinte du document, vérification préalable |
| 2. Matériel examiné | Appareils, n° de série, scellés, état à réception |
| 3. Méthodologie | 3.1 outils et versions · 3.2 procédure d'acquisition · 3.3 principe de non-altération · 3.4 analyse et corroboration · 3.5 règles de détection · 3.6 récupération des enregistrements supprimés (méthode, bilan par base) |
| 4. Éléments de preuve | Fichiers collectés avec leur SHA-256 |
| 5. Chaîne de custody | Date/heure, preuve, action (et lieu), responsable, SHA-256 |
| 6. Constatations | Numérotées. Pour chacune : **faits constatés**, puis tableau des sources (artefact, horodatage, outil · fichier · enregistrement, preuve et son SHA-256), captures et références hachées, puis **interprétation de l'examinateur** dans un bloc distinct |
| 7. Chronologie consolidée | Chaque événement renvoie à ses artefacts et à ses preuves |
| 8. Limites et réserves | Outils non exécutés, portée de l'acquisition logique, fiabilité des horloges |
| 9. Attestation | Texte d'attestation et emplacement de signature |
| Annexes | A : exécutions d'outils (commandes) · B : artefacts cités et empreintes de contenu, enregistrements récupérés (statut, emplacements, fiabilité) · C : intégrité du rapport et journal d'audit · D : glossaire |

Ce modèle reste neutre : il ne contient ni niveau de criticité ni recommandation. Si un
constat n'est rattaché à aucun artefact, **le rapport judiciaire est refusé**, car chaque
affirmation doit pouvoir être reliée à une preuve hachée.

### Modèle entreprise / audit interne

| Partie | Contenu |
|---|---|
| 1. Résumé exécutif (1 page, non technique) | Niveau de risque global, synthèse rédigée (`case.x_veritrace.executive_summary`), ce qu'il faut retenir (`finding.x_veritrace.plain_summary`), décisions immédiates |
| 2. Criticité des constats | Critique / Élevé / Moyen / Faible, fiabilité, impact métier, échelle de criticité |
| 3. Recommandations et plan de remédiation | Actions triées par priorité (immédiat < 48 h, court terme < 30 j, moyen terme < 90 j), avec responsable, échéance et constat d'origine |
| 4. Détails techniques | Faits, analyse, sources de chaque constat ; chronologie des événements clés ; périmètre et méthodologie |
| 5. Limites | |
| Annexe — Preuves | Éléments de preuve, chaîne de custody, pièces (captures et exports), inventaire, intégrité |

### Champs du format pivot utilisés par les rapports

| Champ | Utilisé par |
|---|---|
| `finding.description` | Les deux modèles : **faits uniquement** |
| `finding.ioc` | Les deux modèles : IOC correspondant (type, valeur, fichier, famille) |
| `finding.x_veritrace.interpretation` | Les deux modèles : interprétation, toujours affichée à part |
| `finding.x_veritrace.exhibits[]` | Les deux modèles : captures et exports, avec chemin et SHA-256. Une capture PNG ou JPG présente dans le dossier d'affaire est insérée dans le rapport |
| `finding.x_veritrace.plain_summary`, `.business_impact`, `.remediation[]`, `case.x_veritrace.executive_summary` | Modèle entreprise |

### Fonctionnement commun

- **Pas de divergence entre formats** : le JSON est converti une seule fois en modèle de
  rapport (`reporting/model.py`), puis ce modèle est mis en forme en Markdown et en PDF.
  Aucun moteur de rendu ne relit le JSON.
- Le JSON est revalidé avant chaque rapport. S'il n'est pas conforme, aucun rapport n'est produit.
- Chaque génération écrit un `*.manifest.json` qui contient l'empreinte du JSON source et
  celles des fichiers produits. Ces empreintes sont aussi consignées dans l'audit.
- Toutes les pages portent en pied de page « Veritrace — développé par Nourou Chafikou ».
- Logo : `case init --logo logo.png` le copie dans `assets/`. Sans logo, la page de garde
  affiche un cadre « Emplacement logo ».
- Polices PDF : DejaVu Sans si elle est installée, sinon Bitstream Vera (livrée avec
  ReportLab). On peut imposer une police avec `VERITRACE_PDF_FONT=/chemin/police.ttf`.

---

## Workflow de bout en bout

```bash
# 0. Vérifier le poste
veritrace doctor

# 1. Ouvrir l'affaire
veritrace case init ./VT-2026-0042 --case-id VT-2026-0042 \
  --title "Suspicion de stalkerware" --org-name "Cabinet X" \
  --org-address "…" --org-phone "…" --org-email "…" --logo logo.png \
  --report-type judiciaire --tz Africa/Ouagadougou

# 2. Acquisition ADB (appareil déverrouillé par le titulaire, débogage USB autorisé)
veritrace acquire run --case ./VT-2026-0042 --imei 35xxxxxxxxxxxxx --seal SC-0042 \
  --method packages --method dumpsys --method backup --method bugreport

# 3. Analyse multi-outils + corrélation (automatique après chaque outil)
veritrace parse all --case ./VT-2026-0042 --input ./extraction --mvt-input ./androidqf \
  --iocs stalkerware.stix2 --autopsy-case ./CasAutopsy
veritrace parse sqlite --case ./VT-2026-0042 --input ./VT-2026-0042/acquisition/raw/ACQ-03   # dumpsys

# 4. Relire les constats générés (MVT, règles R1–R6) ; les valider ou en corriger l'interprétation :
veritrace rules review --case ./VT-2026-0042 F-R1-… --interpretation "…"
#    (compléments éventuels dans normalized/veritrace_case.json), puis :
veritrace schema validate VT-2026-0042/normalized/veritrace_case.json

# 5. Rapports
veritrace report --case ./VT-2026-0042 --report judiciaire --format pdf,md --verify-files
veritrace report --case ./VT-2026-0042 --report entreprise

# 6. Contrôle d'intégrité
veritrace audit verify --case ./VT-2026-0042
```

Pour voir des rapports complets tout de suite, à partir de l'exemple fourni :

```bash
veritrace report --input veritrace/schema/examples/example_case.json --report judiciaire -o /tmp/vt
veritrace report --input veritrace/schema/examples/example_case.json --report entreprise -o /tmp/vt
```

---

## Tests

```bash
python -m pytest
```

---

## Architecture

```
veritrace/
├── cli.py                 CLI (Click), garde-fou injecté dans chaque commande
├── banner.py              bannière de démarrage
├── core/
│   ├── authorization.py   confirmation légale bloquante
│   ├── audit.py           journal chaîné en ajout seul
│   ├── case.py            dossier d'affaire, sauvegarde atomique validée
│   ├── hashing.py         SHA-256 fichiers / JSON canonique
│   ├── tools.py           détection ADB / ALEAPP / MVT / Autopsy
│   ├── logging_setup.py   logs console + fichier
│   └── timeutil.py
├── schema/                schéma, validateur, exemple
├── reporting/             modèle → Markdown / PDF
├── acquisition/           adb.py (client sûr), session.py (collecte + custody), backup.py (.ab → .tar)
├── demo/                données FICTIVES (démonstration, autotest `veritrace selftest`)
├── parsing/               base.py (contrat), aleapp.py, mvt.py, autopsy.py, sqlite_native.py, recover.py, runner.py
├── recovery/              sqlite_format.py (lecture brute : pages, WAL, journal), carver.py (récupération)
└── correlation/           engine.py (corroboration, dédoublonnage, timeline), rules.py (R1–R6)
```

---

*Veritrace — développé par Nourou Chafikou.*
