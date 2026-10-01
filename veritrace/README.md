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
| Schéma JSON normalisé + validateur + exemple | ✅ *(schéma provisoire v0.2, voir plus bas)* |
| Reporting judiciaire / entreprise, PDF + Markdown | ✅ |
| Détection des outils externes (`doctor`) | ✅ |
| Acquisition ADB (backup, pull ciblé, custody automatique) | ⏳ prochaine itération |
| Wrappers ALEAPP / MVT / Autopsy + parseurs SQLite | ⏳ (contrat défini dans `parsing/base.py`) |
| Corrélation, timeline, corroboration, détection | ⏳ |

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
ignore l'étape concernée, qui est consignée « non exécutée » dans le rapport. Il ne plante
pas. Pour faire le point :

```bash
veritrace doctor
```

Chaque outil est cherché dans le `PATH`. Pour imposer un chemin, utilisez la variable
correspondante.

| Outil | Rôle | Installation | Variable |
|---|---|---|---|
| **ADB** (Android SDK Platform-Tools) | Acquisition logique | Télécharger *Platform-Tools* sur developer.android.com/tools/releases/platform-tools, décompresser et ajouter au `PATH`. Sous Linux, ajouter aussi les règles udev Android (paquet `android-sdk-platform-tools-common` sur Debian/Ubuntu). | `VERITRACE_ADB` |
| **ALEAPP** | Parsing d'artefacts Android | `git clone https://github.com/abrignoni/ALEAPP && cd ALEAPP && pip install -r requirements.txt`. Point d'entrée : `aleapp.py`. | `VERITRACE_ALEAPP` (chemin de `aleapp.py`) |
| **MVT** (Mobile Verification Toolkit) | Spyware et stalkerware via IOC | `pipx install mvt` (fournit `mvt-android`), puis `mvt-android download-iocs`. | `VERITRACE_MVT` |
| **Autopsy** | Analyse complémentaire | Installeur Windows sur sleuthkit.org/autopsy. Sous Linux : The Sleuth Kit + Java 17, puis le script `unix_setup.sh` de l'archive. | `VERITRACE_AUTOPSY` |

### 3. Versions testées

| Composant | Version testée | Remarque |
|---|---|---|
| Python | 3.11.15 | |
| click | 8.4.2 | |
| jsonschema | 4.26.0 | |
| reportlab | 5.0.1 | |
| ADB / ALEAPP / MVT / Autopsy | **non encore testés** | Les wrappers arrivent aux prochaines itérations. Ce tableau sera complété avec les versions réellement validées. |

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
  - statut « corroboré » seulement si au moins deux outils distincts confirment ;
  - dates valides avec fuseau ;
  - avec `--case-root`, re-hachage des fichiers sur disque.
- **Corroboration** : chaque artefact porte `content_sha256 = SHA-256(JSON canonique de {category, data})`.
  Deux outils qui extraient le même fait produisent la même empreinte, et l'artefact passe
  alors en `corroborated`.

> **Schéma provisoire.** Le schéma de référence n'a pas encore été fourni. La v0.2 a été
> conçue pour couvrir le cahier des charges. Pour la remplacer, déposez le schéma de
> référence à la place du fichier ou pointez `VERITRACE_SCHEMA` dessus, puis adaptez le
> modèle de rapport (`reporting/model.py`) aux noms de champs.

```bash
veritrace schema validate mon_affaire.json [--case-root ./VT-2026-0042]
veritrace schema example -o exemple.json
```

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

### Champs du JSON utilisés par les rapports (schéma v0.2)

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
# 3. Parsing multi-outils     (prochaine itération : veritrace parse …)
# 4. Corrélation / timeline   (prochaine itération : veritrace correlate …)

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
├── parsing/               contrat des wrappers (base.py) ; wrappers à venir
└── correlation/           (à venir)
```

---

*Veritrace — développé par Nourou Chafikou.*
