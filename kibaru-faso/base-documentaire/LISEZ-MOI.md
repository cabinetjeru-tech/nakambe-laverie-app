# Base documentaire MON PROF.IA — structure officielle

Ce dossier est la base documentaire de MON PROF.IA. Sa structure est la **structure documentaire officielle du
projet**. Elle évolue par ajout de ressources et de versions, sans jamais modifier les instructions fondamentales
de MON PROF.IA (le prompt) : il suffit de déposer des fichiers et leur fiche, puis de redéployer.

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
├── REGISTRE_MAITRE.csv   registre maître de toutes les ressources (source centrale des métadonnées)
└── CATALOGUE.md          vue générée : npm run base:catalogue
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

## Registre maître — `REGISTRE_MAITRE.csv`

Le registre maître est le **catalogue central** de MON PROF.IA : une ligne par ressource, qu'elle soit intégrée
(document déposé) ou **NON ENCORE INTÉGRÉE** (connue, mais texte non disponible). Il s'ouvre dans Excel ou LibreOffice
(séparateur `;`, UTF-8). Ses valeurs l'emportent sur la fiche du document et sur son emplacement ; tout désaccord est
signalé par `npm run base:verifier`.

Colonnes (métadonnées obligatoires) : ID ; Titre officiel ; Pays ; Ministère/Institution productrice ; Niveau ;
Classe ; Matière ; Type de document ; Année de publication ; Version ; Date d'intégration dans MON PROF.IA ; Source ;
URL ou référence documentaire ; Statut ; Niveau de source ; Priorité ; Date de dernière vérification ;
Document remplacé ; Document de remplacement ; Observations ; Périmètre d'utilisation ; Fichier ; Avertissement.

- **ID** : format `BF-[CLASSE]-[MATIERE]-[NUMERO]` — classes `6E 5E 4E 3E 2NDE 1ERE TERM`, matières `MATH FR HIST GEO SVT
  PHYS ANG ALL ESP AR PHILO EPS ECM INFO ECO` (ex. `BF-6E-MATH-001`, `BF-2NDE-MATH-001`, `BF-TERM-PHYS-001`). Unique.
  Une ressource couvrant plusieurs classes prend le code de la première (ex. `BF-6E-FR-001` pour « 6e-5e »).
- **Classe** : `6e`, `6e-5e`, `4e, 3e`…
- **Type de document** : `PROGRAMME`, `CURRICULUM`, `GUIDE_PEDAGOGIQUE`, `MANUEL`, `REFERENTIEL`, `PROGRESSION`,
  `FICHE_PEDAGOGIQUE`, `EVALUATION`, `EXAMEN`, `TEXTE_OFFICIEL`, `NOTE_DE_SERVICE`, `CIRCULAIRE`, `RESSOURCE_COMPLEMENTAIRE`.
- **Statut** : voir ci-dessous. **Niveau de source** : hiérarchie 1 à 5 (ci-dessous). **Priorité** : `Haute`, `Moyenne`
  ou `Basse` — priorité de traitement (intégration, vérification).
- **Fichier** : chemin du document dans la structure, une fois déposé. Vide ou introuvable → NON ENCORE INTÉGRÉ.
- **Année, version, dates** : laissez « À vérifier » ou vide tant qu'elles ne sont pas lues sur le document. Ne jamais
  les deviner.

Le registre initial ne certifie pas l'actualité des documents : les statuts sont mis à jour après vérification
documentaire. Pour les classes et types encore non couverts (3e, 2nde, 1ère, Terminale…), on n'ajoute une ligne que
lorsqu'une ressource réelle est identifiée — jamais de ligne artificielle. `CATALOGUE.md` affiche la couverture par
classe et type, avec « NON ENCORE INTÉGRÉ » là où rien n'est encore identifié.

## Formats

`.pdf` (contenant du texte ; un scan en image ne peut pas être lu), `.docx`, `.txt`, `.md`.

## Fiche descriptive du document (facultative si la ressource est au registre)

Pour un `.pdf` ou un `.docx` : fichier voisin de même nom suivi de `.meta` (ex. `guide.pdf.meta`).
Pour un `.md` ou un `.txt` : en tête du fichier, entre deux lignes `---`.
Les lignes commençant par `#` sont des commentaires.

```
id: BF-6E-MATH-002
titre: Programme de mathématiques — classe de 6e
pays: Burkina Faso
niveau: Post-primaire
classe: 6e
matiere: Mathématiques
type: PROGRAMME
organisme: [ministère / direction émettrice]
annee: 2024
version: 2
date_integration: 2026-09-28
statut: ACTIF
source: [site, service, référence exacte]
niveau_source: 1
priorite: Haute
date_verification: 2026-09-28
remplace: BF-6E-MATH-001
date_remplacement: 2026-09-28
observations: [facultatif]
avertissement: [facultatif — règle d'usage que MON PROF.IA doit respecter]
```

| Métadonnée | Obligatoire | Rôle |
|---|---|---|
| `id` | oui | ID unique au format `BF-[CLASSE]-[MATIERE]-[NUMERO]`. Il relie le document à sa ligne du registre. |
| `titre`, `pays`, `niveau`, `classe`, `matiere`, `type` | oui | Identification et champ d'application (le chemin peut fournir pays → type). |
| `organisme` | oui | Organisme ou producteur. |
| `annee`, `version` | oui | Date et version (le chemin peut les fournir). |
| `date_integration` | oui | Date d'entrée dans la base MON PROF.IA. |
| `statut` | oui | Voir ci-dessous. **Sans statut, la ressource est traitée comme À VÉRIFIER — jamais comme ACTIVE.** |
| `source` | oui | Provenance exacte (site, service, référence). |
| `niveau_source` | oui | Hiérarchie des sources : 1 sources officielles (ministère, directions générales, institutions habilitées, textes réglementaires) ; 2 documents curriculaires officiels (programmes, curricula, référentiels, guides validés) ; 3 ressources institutionnelles complémentaires ; 4 ressources pédagogiques fiables non officielles ; 5 connaissances générales du modèle. |
| `priorite` | oui | Haute, Moyenne ou Basse (priorité de traitement). |
| `perimetre` | oui | Périmètre d'utilisation (ce pour quoi la ressource peut servir). |
| `url` | si disponible | URL ou référence documentaire. |
| `date_verification` | oui | Date de la dernière vérification humaine de la ressource. |
| `remplace` / `remplace_par` | si besoin | ID de la ou des ressources remplacées / remplaçantes. |
| `date_remplacement` | si besoin | Date du remplacement. |
| `date_expiration`, `observations`, `avertissement` | non | Fin de validité, remarque, règle d'usage. |

Une valeur `à renseigner` est ignorée : **n'inventez jamais** une année, une version ou une date.

## Statuts

| Statut | Consulté par MON PROF.IA ? | Traitement |
|---|---|---|
| `ACTIF` | oui | Actuellement confirmée comme utilisable dans son périmètre. Seule une ressource ACTIVE, officielle et pertinente peut fonder une affirmation sur les programmes ou orientations du Burkina Faso. |
| `À_VÉRIFIER` | oui | Officielle ou sérieuse, mais actualité, portée ou applicabilité actuelle insuffisamment confirmées. Citée comme « source officielle historique » ; ce qui en provient reste « À VÉRIFIER ». |
| `PROVISOIRE` | oui | Intégrée temporairement en attendant validation ; présentée comme provisoire. |
| `REMPLACÉ` | non | Officiellement remplacée par une autre ressource ; conservée dans l'historique. |
| `ARCHIVE` | non | Conservée pour l'historique, jamais référence principale (de préférence rangée dans `09_ARCHIVES`). |

**Officiel ≠ automatiquement actuel** : une ressource officielle ancienne n'est jamais présentée comme le programme
en vigueur sans ressource ACTIVE qui le confirme.

À pertinence égale, MON PROF.IA privilégie la priorité la plus officielle, puis ACTIF avant PROVISOIRE avant À VÉRIFIER.

## Règles de versions

1. **Un document plus ancien n'est jamais automatiquement obsolète**, et **un document plus récent n'est jamais
   automatiquement applicable** : ni la date ni le titre ne suffisent. Aucun remplacement n'est deviné.
2. Pour choisir la source, MON PROF.IA prend en compte : le caractère officiel (`priorite`), le champ d'application
   (pays, niveau, classe, matière), la date, la version, le statut et un éventuel remplacement déclaré.
3. Un remplacement ne s'applique que s'il est **déclaré** (`remplace` sur la nouvelle ressource, ou `remplace_par`
   sur l'ancienne) **et** que la nouvelle ressource est **ACTIVE**. Tant qu'elle est PROVISOIRE ou À VÉRIFIER,
   l'ancienne reste consultée, et MON PROF.IA est informé qu'une version plus récente existe.
4. **On ne supprime jamais silencieusement** une ressource : on change son statut (REMPLACÉ ou ARCHIVE) et on peut
   la déplacer dans `09_ARCHIVES` en conservant son chemin d'origine. L'historique des versions est conservé et
   visible dans l'application et dans `CATALOGUE.md`.

## Ajouter une nouvelle version, pas à pas

1. Obtenez un ID libre (`npm run base:nouvel-id -- 6e Mathématiques`), puis ajoutez une ligne au registre : nouvel ID, « Document remplacé » = ancien ID, statut `PROVISOIRE` ou `À_VÉRIFIER` tant
   que son application officielle n'est pas confirmée ; déposez le fichier dans `…/ANNÉE/VERSION/` et renseignez « Fichier ».
2. Une fois l'application confirmée : statut `ACTIF`, date de vérification et date de remplacement à jour. Sur la ligne
   de l'ancienne ressource : statut `REMPLACÉ` et « Document de remplacement » = nouvel ID. Ne supprimez jamais la ligne.
3. `npm run base:verifier`, puis `npm run base:catalogue`, puis redéployez.

## Moteur de décision documentaire

Avant chaque réponse, l'application : 1. identifie pays, niveau, classe, matière, thème et type de demande (la demande
écrite l'emporte sur le contexte de la classe) ; 2. recense les ressources du registre pour ce périmètre ; 3. filtre
les ressources consultables et pertinentes ; 4. repère les versions concurrentes ; 5. applique les remplacements
déclarés ; 6. évalue la **confiance documentaire** — ÉLEVÉE (ressource ACTIVE de niveau 1 ou 2), MOYENNE (ACTIVE non
officielle ou PROVISOIRE), FAIBLE (seulement À VÉRIFIER ou documents personnels), AUCUNE ; 7. transmet au modèle la
consigne correspondante. La confiance est affichée à l'enseignant au-dessus de chaque réponse.

## Outils

| Commande | Rôle |
|---|---|
| `npm run base:verifier` | Contrôle : métadonnées manquantes, statuts illisibles, ID en double, remplacements vers des ID inconnus, fiche en désaccord avec son dossier, fichier hors structure, fiche sans document. |
| `npm run base:catalogue` | Régénère `CATALOGUE.md` : tableau maître, couverture par classe, ressources consultables, dossiers de dépôt des ressources NON ENCORE INTÉGRÉES, historique des versions, contrôles. |

Une ressource du registre (ou une fiche `.meta`) sans document est NON ENCORE INTÉGRÉE : elle apparaît dans le
catalogue, dans l'application et dans la décision documentaire, mais aucun contenu n'en est consulté.

Les fichiers `LISEZ-MOI.md`, `CATALOGUE.md` et `REGISTRE_MAITRE.csv` ne sont jamais lus comme des ressources.
