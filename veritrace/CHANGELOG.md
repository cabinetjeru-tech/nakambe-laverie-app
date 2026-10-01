# Journal des versions — Veritrace

## 0.2.0 — 2026-10-01

### Distribution
- Exécutables autonomes (Windows, Linux, macOS) produits par PyInstaller : aucun Python
  requis sur le poste d'examen. Scripts d'installation sans droits administrateur
  (`install.cmd` / `install.ps1`, `install.sh`).
- Paquet Python (`.whl`) avec options `exif` et `all`, métadonnées et licence SPDX.
- Publication automatisée (GitHub Actions) : archives par plateforme, paquet Python et
  `SHA256SUMS.txt`, après un autotest réussi de chaque exécutable.
- Intégration continue : tests sous Windows, macOS et Linux (Python 3.10 et 3.12).

### Nouveautés
- `veritrace selftest` : chaîne complète sur des données fictives (parsing, récupération,
  corrélation, validation, rapports PDF/Markdown, audit). `--keep` conserve l'affaire.
- `veritrace doctor` indique où obtenir chaque outil absent et la variable à définir.
- Détection des outils hors `PATH` : dossiers du SDK Android, AppData, dossier
  `platform-tools` placé à côté de l'exécutable.
- Polices DejaVu livrées avec Veritrace : rapports PDF identiques sur tous les systèmes.
- Récupération des enregistrements supprimés SQLite (`veritrace parse recover`, règle R6).
- Messageries tierces : WhatsApp, Viber, Facebook Messenger, Telegram ; Signal détecté.
- Guide utilisateur (`GUIDE_UTILISATEUR.md`).

### Corrections (portabilité Windows)
- Verrou du journal d'audit sous Windows (`msvcrt`) : écritures concurrentes sérialisées.
- Console en UTF-8 : plus d'erreur d'encodage sur les symboles ✔ ✖ et les accents.
- Lecture des sorties TSV d'ALEAPP : limite de champ compatible Windows.
- Exécutable autonome : ALEAPP (script `.py`) lancé avec le Python du système.

## 0.1.0

Première version : garde-fou d'autorisation, journal d'audit chaîné, acquisition ADB,
wrappers ALEAPP / MVT / Autopsy, parseurs natifs, corrélation, règles R1–R5, rapports
judiciaire et entreprise.
