# Base documentaire KIBARU FASO — structure officielle

Ce dossier est la base documentaire de KIBARU FASO. Sa structure est la **structure documentaire officielle du
projet**. Elle évolue par ajout de ressources et de versions, sans jamais modifier les instructions fondamentales
de KIBARU (le prompt) : il suffit de déposer des fichiers et leur fiche, puis de redéployer.

```
base-documentaire/
├── 01_PROGRAMMES_ET_CURRICULA
├── 02_GUIDES_PEDAGOGIQUES
├── 03_MANUELS_ET_RESSOURCES
├── 04_PROGRESSIONS
├── 05_EVALUATIONS
├── 06_REMEDIATION
├── 07_REFERENTIELS_ET_TEXTES_OFFICIELS
├── 08_RESSOURCES_COMPLEMENTAIRES
├── 09_ARCHIVES
└── CATALOGUE.md          (généré : npm run base:catalogue)
```

Dans chaque catégorie :

```
PAYS / NIVEAU / CLASSE / MATIÈRE / TYPE_DE_DOCUMENT / ANNÉE / VERSION / fichier
```

Exemple :

```
01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/PROGRAMME/2024/V1/programme-maths-6e.pdf
01_PROGRAMMES_ET_CURRICULA/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/PROGRAMME/2024/V1/programme-maths-6e.pdf.meta
02_GUIDES_PEDAGOGIQUES/BURKINA_FASO/POST_PRIMAIRE/6E/MATHEMATIQUES/guide.pdf
```

| Niveau de dossier | Valeurs reconnues |
|---|---|
| PAYS | `BURKINA_FASO` (d'autres pays peuvent être ajoutés) |
| NIVEAU | `POST_PRIMAIRE` (6e → 3e), `SECONDAIRE` (2nde → Terminale), `TOUS_NIVEAUX` |
| CLASSE | `6E`, `5E`, `4E`, `3E`, `2NDE`, `1ERE`, `TLE`, ou `TOUTES_CLASSES` |
| MATIÈRE | `MATHEMATIQUES`, `FRANCAIS`, `PHYSIQUE_CHIMIE`, `SVT`, `HISTOIRE_GEOGRAPHIE`, `ANGLAIS`, `PHILOSOPHIE`… ou `TOUTES_MATIERES` |
| TYPE | libre : `PROGRAMME`, `CURRICULUM`, `GUIDE_PEDAGOGIQUE`, `PROGRESSION_ANNUELLE`… |
| ANNÉE | quatre chiffres : `2024` |
| VERSION | `V1`, `V2`, `V2_1`… |

Les niveaux après la matière sont facultatifs. Le chemin sert de valeur par défaut ; **la fiche descriptive reste
prioritaire**, et tout désaccord entre les deux est signalé par `npm run base:verifier`.

## Formats

`.pdf` (contenant du texte ; un scan en image ne peut pas être lu), `.docx`, `.txt`, `.md`.

## Fiche descriptive (obligatoire pour chaque ressource)

Pour un `.pdf` ou un `.docx` : fichier voisin de même nom suivi de `.meta` (ex. `guide.pdf.meta`).
Pour un `.md` ou un `.txt` : en tête du fichier, entre deux lignes `---`.
Les lignes commençant par `#` sont des commentaires.

```
id: BF-MATH-6E-PROG-002
titre: Programme de mathématiques — classe de 6e
pays: Burkina Faso
niveau: Post-primaire
classe: 6e
matiere: Mathématiques
type: programme
organisme: [ministère / direction émettrice]
annee: 2024
version: 2
date_integration: 2026-09-28
statut: ACTIF
source: [site, service, référence exacte]
priorite: 1
date_verification: 2026-09-28
remplace: BF-MATH-6E-PROG-001
date_remplacement: 2026-09-28
observations: [facultatif]
avertissement: [facultatif — règle d'usage que KIBARU doit respecter]
```

| Métadonnée | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | ID unique et stable. Convention : `PAYS-MATIÈRE-CLASSE-TYPE-NUMÉRO` (ex. `BF-MATH-6E-GUIDE-001`). Deux ressources ne partagent jamais un ID. |
| `titre`, `pays`, `niveau`, `classe`, `matiere`, `type` | oui | Identification et champ d'application (le chemin peut fournir pays → type). |
| `organisme` | oui | Organisme ou producteur. |
| `annee`, `version` | oui | Date et version (le chemin peut les fournir). |
| `date_integration` | oui | Date d'entrée dans la base KIBARU. |
| `statut` | oui | Voir ci-dessous. **Sans statut, la ressource est traitée comme À VÉRIFIER — jamais comme ACTIVE.** |
| `source` | oui | Provenance exacte (site, service, référence). |
| `priorite` | oui | Hiérarchie des sources : 1 document officiel du ministère, 2 programme / guide officiellement reconnu, 3 document institutionnel complémentaire, 4 ressource secondaire fiable. |
| `date_verification` | oui | Date de la dernière vérification humaine de la ressource. |
| `remplace` / `remplace_par` | si besoin | ID de la ou des ressources remplacées / remplaçantes. |
| `date_remplacement` | si besoin | Date du remplacement. |
| `date_expiration`, `observations`, `avertissement` | non | Fin de validité, remarque, règle d'usage. |

Une valeur `à renseigner` est ignorée : **n'inventez jamais** une année, une version ou une date.

## Statuts

| Statut | Consulté par KIBARU ? | Traitement |
|---|---|---|
| `ACTIF` | oui | Référence utilisable. Seule une ressource ACTIVE, officielle et pertinente peut fonder une affirmation sur les programmes ou orientations du Burkina Faso. |
| `PROVISOIRE` | oui | Présentée comme provisoire, jamais comme définitive. |
| `À VÉRIFIER` | oui | Peut être citée, mais ce qui en provient reste « À VÉRIFIER » et ne confirme aucune prescription. |
| `REMPLACÉ` | non | Conservée dans l'historique. |
| `ARCHIVE` | non | Conservée dans l'historique (de préférence rangée dans `09_ARCHIVES`). |

À pertinence égale, KIBARU privilégie la priorité la plus officielle, puis ACTIF avant PROVISOIRE avant À VÉRIFIER.

## Règles de versions

1. **Un document plus ancien n'est jamais automatiquement obsolète**, et **un document plus récent n'est jamais
   automatiquement applicable** : ni la date ni le titre ne suffisent. Aucun remplacement n'est deviné.
2. Pour choisir la source, KIBARU prend en compte : le caractère officiel (`priorite`), le champ d'application
   (pays, niveau, classe, matière), la date, la version, le statut et un éventuel remplacement déclaré.
3. Un remplacement ne s'applique que s'il est **déclaré** (`remplace` sur la nouvelle ressource, ou `remplace_par`
   sur l'ancienne) **et** que la nouvelle ressource est **ACTIVE**. Tant qu'elle est PROVISOIRE ou À VÉRIFIER,
   l'ancienne reste consultée, et KIBARU est informé qu'une version plus récente existe.
4. **On ne supprime jamais silencieusement** une ressource : on change son statut (REMPLACÉ ou ARCHIVE) et on peut
   la déplacer dans `09_ARCHIVES` en conservant son chemin d'origine. L'historique des versions est conservé et
   visible dans l'application et dans `CATALOGUE.md`.

## Ajouter une nouvelle version, pas à pas

1. Déposez le nouveau fichier dans son dossier `…/ANNÉE/VERSION/`, avec sa fiche : nouvel `id`, `remplace:` = ancien
   ID, `statut: PROVISOIRE` ou `À VÉRIFIER` tant que son application officielle n'est pas confirmée.
2. Une fois l'application confirmée : `statut: ACTIF`, `date_verification` et `date_remplacement` à jour. Sur
   l'ancienne fiche : `statut: REMPLACÉ` et `remplace_par:` = nouvel ID. Ne supprimez pas l'ancienne.
3. `npm run base:verifier`, puis `npm run base:catalogue`, puis redéployez.

## Outils

| Commande | Rôle |
|---|---|
| `npm run base:verifier` | Contrôle : métadonnées manquantes, statuts illisibles, ID en double, remplacements vers des ID inconnus, fiche en désaccord avec son dossier, fichier hors structure, fiche sans document. |
| `npm run base:catalogue` | Régénère `CATALOGUE.md` : ressources consultables par catégorie, fiches en attente, historique des versions, filiations, contrôles. |

Une fiche `.meta` déposée sans son document est enregistrée « en attente d'intégration » : elle apparaît dans le
catalogue et dans l'application, mais aucun contenu n'en est consulté.

Les fichiers `LISEZ-MOI.md` et `CATALOGUE.md` ne sont jamais lus comme des ressources.
