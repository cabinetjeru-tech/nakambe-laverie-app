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
| Schéma JSON normalisé + validateur + exemple | ✅ *(schéma provisoire v0.3, voir plus bas)* |
| Reporting judiciaire / entreprise, PDF + Markdown | ✅ |
| Détection des outils externes (`doctor`) | ✅ |
| Acquisition ADB (backup, pull ciblé, custody automatique) | ⏳ prochaine itération |
| Wrappers ALEAPP / MVT / Autopsy (`veritrace parse …`) | ✅ |
| Corrélation inter-outils : corroboration, dédoublonnage, timeline (`veritrace correlate`) | ✅ |
| Parseurs SQLite natifs Veritrace, règles de détection d'anomalies | ⏳ |

---

## Installation

### 1. Veritrace

Python ≥ 3.10.

```bash
cd veritrace
python -m venv .venv && source .venv/bin/activate   # Windows : .venv\Scripts\activate
pip install -e ".[dev]"
veritrace --version
```

### 2. Outils externes

Ces outils sont **optionnels**. S'il en manque un, Veritrace affiche un avertissement et
consigne l'étape comme « non exécutée » (`skipped`) dans l'affaire et dans le rapport. Il
ne plante pas. Pour faire le point :

```bash
veritrace doctor
```

Chaque outil est cherché dans le `PATH`. Pour imposer un chemin, utilisez la variable
d'environnement indiquée. Il est conseillé d'installer **chaque outil dans son propre
environnement virtuel**, car leurs dépendances entrent en conflit entre elles.

#### ADB (Android SDK Platform-Tools)
Rôle : acquisition logique (module à venir).
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
| ADB | non testé | Le module d'acquisition reste à faire. |

Pour relancer les tests avec les vrais outils :
`VERITRACE_ALEAPP=… VERITRACE_ALEAPP_PYTHON=… VERITRACE_MVT=… python -m pytest -k real`

---

## Garde-fous

### Confirmation d'autorisation (bloquante)
Chaque commande, sauf `--help` et `--version`, commence par cette séquence :

1. nom de l'examinateur ;
2. base légale : `consentement`, `mandat`, `requisition`, `ordonnance` ou `politique-entreprise` ;
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

## Contrat de données

- Schéma : `veritrace/schema/veritrace_case.schema.json` (JSON Schema 2020-12).
- Exemple complet (affaire fictive) : `veritrace/schema/examples/example_case.json`.
- Le validateur contrôle d'abord la **structure** (JSON Schema), puis la **sémantique** :
  - unicité des identifiants ;
  - intégrité référentielle : artefact → exécution d'outil → preuve → acquisition → appareil ;
  - empreintes de custody identiques à celle de la preuve ;
  - `content_sha256` cohérent avec les données ;
  - statut « corroboré » seulement si au moins deux moteurs d'analyse indépendants confirment le même fait ;
  - dates valides avec fuseau ;
  - avec `--case-root`, re-hachage des fichiers sur disque.
- **Deux empreintes par artefact** :
  - `content_sha256` couvre le contenu exact (`{category, data}`) ;
  - `fact_sha256` couvre l'identité du fait. C'est elle qui sert au dédoublonnage et à la
    corroboration (voir « Analyse multi-outils »).

> **Schéma provisoire.** Le schéma de référence n'a pas encore été fourni. La v0.3 a été
> conçue pour couvrir le cahier des charges. Pour la remplacer, déposez le schéma de
> référence à la place du fichier ou pointez `VERITRACE_SCHEMA` dessus, puis adaptez le
> modèle de rapport (`reporting/model.py`) aux noms de champs.

```bash
veritrace schema validate mon_affaire.json [--case-root ./VT-2026-0042]
veritrace schema example -o exemple.json
```

---

## Analyse multi-outils

Les trois wrappers partagent la même interface (`parsing/base.py`). L'**entrée** est le
chemin de l'extraction. La **sortie** est du JSON normalisé, versé dans le dossier d'affaire.

```bash
veritrace parse aleapp  --case ./VT --input ./extraction            # lance ALEAPP (parsing complet)
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
| ALEAPP | Lit la sortie LAVA (`_lava_data.lava` + `_lava_artifacts.db`), ou les TSV pour les versions antérieures. Catégories : SMS/MMS, appels, contacts, historique web, localisations, applications installées, usage des applications (événements), comptes, Wi-Fi, Bluetooth. Les artefacts non couverts sont listés dans le rapport et restent dans la sortie brute. |
| MVT | Mode détecté automatiquement (AndroidQF, sauvegarde `.ab`, bugreport) ; si le format n'est pas reconnu, Veritrace le signale au lieu de deviner. **Chaque détection d'IOC devient un constat « critique » (alerte MVT CRITICAL) ou « élevé » (autres niveaux)**, avec l'indicateur, le jeu d'IOC et la famille. Les alertes heuristiques MEDIUM ou plus deviennent des constats « application suspecte ». Les applications installées servent à la corroboration. |
| Autopsy | Lit `autopsy.db` (cas, Portable Case ou fichier `.db`). Seuls les artefacts du **module Android** sont retenus (option `--module` pour en ajouter d'autres). |

### Corroboration et dédoublonnage

- Chaque artefact porte une **empreinte de fait** (`fact_sha256`), calculée sur ses seuls
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
| 3. Méthodologie | 3.1 outils et versions · 3.2 procédure d'acquisition · 3.3 principe de non-altération · 3.4 analyse et corroboration |
| 4. Éléments de preuve | Fichiers collectés avec leur SHA-256 |
| 5. Chaîne de custody | Date/heure, preuve, action (et lieu), responsable, SHA-256 |
| 6. Constatations | Numérotées. Pour chacune : **faits constatés**, puis tableau des sources (artefact, horodatage, outil · fichier · enregistrement, preuve et son SHA-256), captures et références hachées, puis **interprétation de l'examinateur** dans un bloc distinct |
| 7. Chronologie consolidée | Chaque événement renvoie à ses artefacts et à ses preuves |
| 8. Limites et réserves | Outils non exécutés, portée de l'acquisition logique, fiabilité des horloges |
| 9. Attestation | Texte d'attestation et emplacement de signature |
| Annexes | A : exécutions d'outils (commandes) · B : artefacts cités et empreintes de contenu · C : intégrité du rapport et journal d'audit · D : glossaire |

Ce modèle reste neutre : il ne contient ni niveau de criticité ni recommandation. Si un
constat n'est rattaché à aucun artefact, **le rapport judiciaire est refusé**, car chaque
affirmation doit pouvoir être reliée à une preuve hachée.

### Modèle entreprise / audit interne

| Partie | Contenu |
|---|---|
| 1. Résumé exécutif (1 page, non technique) | Niveau de risque global, synthèse rédigée (`case.executive_summary`), ce qu'il faut retenir (`finding.plain_summary`), décisions immédiates |
| 2. Criticité des constats | Critique / Élevé / Moyen / Faible, fiabilité, impact métier, échelle de criticité |
| 3. Recommandations et plan de remédiation | Actions triées par priorité (immédiat < 48 h, court terme < 30 j, moyen terme < 90 j), avec responsable, échéance et constat d'origine |
| 4. Détails techniques | Faits, analyse, sources de chaque constat ; chronologie des événements clés ; périmètre et méthodologie |
| 5. Limites | |
| Annexe — Preuves | Éléments de preuve, chaîne de custody, pièces (captures et exports), inventaire, intégrité |

### Champs du JSON utilisés par les rapports (schéma v0.3)

| Champ | Utilisé par |
|---|---|
| `finding.description` | Les deux modèles : **faits uniquement** |
| `finding.interpretation` | Les deux modèles : interprétation, toujours affichée à part |
| `finding.exhibits[]` | Les deux modèles : captures et exports, avec chemin et SHA-256. Une capture PNG ou JPG présente dans le dossier d'affaire est insérée dans le rapport |
| `finding.plain_summary`, `finding.business_impact`, `finding.remediation[]`, `case.executive_summary` | Modèle entreprise |

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

# 2. Acquisition ADB          (prochaine itération : veritrace acquire …)

# 3. Analyse multi-outils + corrélation (automatique après chaque outil)
veritrace parse all --case ./VT-2026-0042 --input ./extraction --mvt-input ./androidqf \
  --iocs stalkerware.stix2 --autopsy-case ./CasAutopsy

# 4. Relire les constats générés (MVT) et compléter interprétation / remédiation
#    dans normalized/veritrace_case.json, puis :
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
├── acquisition/           (à venir)
├── parsing/               base.py (contrat), aleapp.py, mvt.py, autopsy.py, runner.py
└── correlation/           engine.py : corroboration, dédoublonnage, timeline
```

---

*Veritrace — développé par Nourou Chafikou.*
