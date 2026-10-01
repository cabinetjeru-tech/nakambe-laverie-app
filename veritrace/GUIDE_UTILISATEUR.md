# Veritrace — Guide de démarrage

Veritrace est un assistant de forensique Android réservé aux **examens autorisés**
(consentement écrit du titulaire, mandat, ordre judiciaire ou politique d'entreprise).

Il enchaîne les étapes suivantes :
- l'acquisition par ADB ;
- l'analyse, avec ALEAPP, MVT, Autopsy et ses propres analyseurs ;
- la récupération des enregistrements supprimés ;
- la corrélation des résultats ;
- les rapports judiciaire ou entreprise, en PDF et en Markdown.

Chaque action est inscrite dans un journal d'audit horodaté et infalsifiable.

*Veritrace — développé par Nourou Chafikou.*

---

## 1. Installation (5 minutes)

### Option A — Exécutable autonome (recommandé, aucun Python requis)

Téléchargez l'archive de votre système depuis la page des versions (*Releases*) :

| Système | Archive |
|---|---|
| Windows 10 / 11 (64 bits) | `veritrace-<version>-windows-x64.zip` |
| Linux (64 bits) | `veritrace-<version>-linux-x64.zip` |
| macOS (Apple Silicon) | `veritrace-<version>-macos-arm64.zip` |

**Windows**
1. Décompressez l'archive (clic droit › *Extraire tout*).
2. Double-cliquez sur `install.cmd`. Veritrace s'installe pour votre compte, sans droits
   administrateur, et s'ajoute au `PATH`.
3. Ouvrez un **nouveau** terminal (PowerShell ou Invite de commandes).

> Le programme n'est pas encore signé numériquement. Windows peut afficher l'avertissement
> SmartScreen « Windows a protégé votre ordinateur » : cliquez sur *Informations
> complémentaires*, puis sur *Exécuter quand même*.

**Linux / macOS**
```sh
unzip veritrace-<version>-linux-x64.zip && cd veritrace-<version>-linux-x64
./install.sh                 # installe dans ~/.local/bin
```

Vérifiez l'intégrité de l'archive téléchargée avec le fichier `SHA256SUMS.txt` publié avec
la version. Sous Windows : `certutil -hashfile <archive>.zip SHA256`. Sous Linux et
macOS : `shasum -a 256 <archive>.zip`.

### Option B — Paquet Python (postes disposant de Python ≥ 3.10)

```sh
pip install veritrace-<version>-py3-none-any.whl          # ou : pipx install …
pip install "veritrace-<version>-py3-none-any.whl[exif]"  # + analyse EXIF des photos
```

### Vérifier l'installation

```sh
veritrace --version
veritrace selftest      # chaîne complète sur des données FICTIVES : doit finir par « Installation opérationnelle »
veritrace doctor        # outils externes présents / absents, et où les obtenir
```

Toutes les commandes demandent d'abord de **confirmer l'autorisation légale** :
- le nom de l'examinateur ;
- la base légale ;
- la référence du document d'autorisation ;
- la phrase `AUTORISATION VERIFIEE`, à taper exactement.

C'est voulu : rien ne s'exécute sans cette confirmation.

## 2. Outils externes (facultatifs)

Veritrace fonctionne sans eux. Une étape dont l'outil manque est signalée et marquée
« non exécutée » dans le rapport ; elle n'arrête rien.

| Outil | Sert à | Obtenir |
|---|---|---|
| ADB (Platform-Tools) | acquisition depuis le téléphone | https://developer.android.com/tools/releases/platform-tools |
| ALEAPP | analyse complémentaire des artefacts | https://github.com/abrignoni/ALEAPP |
| MVT | détection de logiciels espions (IOC STIX2) | `pip install mvt` — https://docs.mvt.re |
| Autopsy | import d'un cas Autopsy | https://www.autopsy.com/download/ |

Où Veritrace cherche ces outils :
- dans le `PATH` ;
- dans les dossiers d'installation usuels : SDK Android, AppData ;
- dans un dossier `platform-tools` placé **à côté de `veritrace.exe`**.

Pour imposer un chemin, utilisez la variable d'environnement indiquée par
`veritrace doctor`, par exemple `VERITRACE_ADB`.

## 3. Une affaire, de bout en bout

```sh
# 1. Ouvrir l'affaire (un dossier par affaire)
veritrace case init ./VT-2026-0042 --case-id VT-2026-0042 --title "Suspicion de stalkerware" \
  --org-name "Cabinet X" --org-phone "…" --org-email "…" --logo logo.png \
  --report-type judiciaire --tz Africa/Ouagadougou

# 2. Acquisition. Le téléphone est déverrouillé par son titulaire et le débogage USB est
#    autorisé. Veritrace ne contourne JAMAIS un verrouillage.
veritrace acquire devices
veritrace acquire run --case ./VT-2026-0042 --imei 35xxxxxxxxxxxxx --seal SC-0042 \
  --method packages --method dumpsys --method backup --method bugreport

# 3. Analyse : outils disponibles, analyseurs natifs, récupération des supprimés, corrélation
veritrace parse all --case ./VT-2026-0042 --input ./extraction --iocs stalkerware.stix2

# 4. Relecture des constats générés automatiquement (règles R1–R6, MVT)
veritrace rules review --case ./VT-2026-0042 F-R1-… --interpretation "…"

# 5. Rapports (PDF + Markdown, depuis les mêmes données)
veritrace report --case ./VT-2026-0042 --report judiciaire --format pdf,md --verify-files
veritrace report --case ./VT-2026-0042 --report entreprise

# 6. Contrôle d'intégrité du journal d'audit
veritrace audit verify --case ./VT-2026-0042
```

Le contenu du dossier d'affaire :

| Dossier | Contenu |
|---|---|
| `acquisition/` | éléments collectés, en lecture seule, hachés SHA-256 dès la collecte |
| `custody/` | documents d'autorisation, manifestes d'empreintes, fichiers d'IOC |
| `parsed/` | sorties brutes des outils et fragments normalisés |
| `normalized/veritrace_case.json` | données consolidées : la source unique des rapports |
| `reports/` | rapports, avec un manifeste d'empreintes par rapport |
| `audit/audit.jsonl` | journal d'audit chaîné de l'affaire |
| `logs/` | journal technique |

## 4. Bonnes pratiques

- Travaillez sur un poste dédié. Un dossier d'affaire contient des données personnelles :
  ne le synchronisez jamais avec un service en ligne non autorisé.
- Indiquez le fuseau horaire de l'affaire (`--tz`). Les rapports affichent les heures
  dans ce fuseau ; les données restent stockées en UTC.
- Relisez chaque constat généré automatiquement avant de l'inclure dans un rapport
  judiciaire. Le rapport signale ceux qui n'ont pas été revus.
- Enregistrements récupérés : la date de suppression n'est jamais connue. Ne rien
  retrouver ne prouve pas qu'il n'y a pas eu de suppression (voir les limites du rapport).

## 5. Dépannage

| Symptôme | Que faire |
|---|---|
| `veritrace` introuvable après l'installation | ouvrir un **nouveau** terminal ; sinon vérifier le `PATH` |
| SmartScreen ou Gatekeeper bloque le programme | voir § 1 (programme non signé) |
| `doctor` indique ADB absent | installer Platform-Tools ou définir `VERITRACE_ADB` |
| Appareil `unauthorized` | déverrouiller le téléphone et accepter l'empreinte RSA du poste |
| Sauvegarde ADB vide ou refusée | confirmer la sauvegarde **sur l'écran du téléphone**, sans mot de passe |
| ALEAPP fourni en script `.py` avec l'exécutable autonome | installer Python 3 ou définir `VERITRACE_ALEAPP_PYTHON` |
| Autotest en échec | relancer `veritrace selftest --keep ./autotest` et transmettre `./autotest` au support |

La documentation technique complète se trouve dans `README.md` : format des données,
règles de détection, récupération des supprimés, versions testées.
