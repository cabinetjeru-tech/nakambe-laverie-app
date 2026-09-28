# Base documentaire KIBARU FASO

Déposez ici les documents validés sur lesquels KIBARU FASO doit s'appuyer : programmes, curricula, guides
pédagogiques, progressions officielles, référentiels, documents d'accompagnement (configuration V2, sections 3 à 7).

**N'y déposez que des documents authentiques, dont vous connaissez l'origine.** KIBARU FASO présente leur contenu
comme « SOURCE KIBARU » : un document inexact deviendrait une fausse référence.

## Formats acceptés

- `.md` ou `.txt` (recommandé : le texte est lu sans erreur) ;
- `.pdf` (PDF contenant du texte ; un PDF scanné en image ne peut pas être lu) ;
- `.docx` (Word).

Les sous-dossiers sont permis, par exemple `mathematiques/`, `francais/`, `svt/`.

## Fiche descriptive de chaque document (section 5)

Pour un fichier `.md` ou `.txt`, en tête du fichier, entre deux lignes `---`. Pour un `.pdf` ou un `.docx`, dans
un fichier voisin portant le même nom suivi de `.meta` (par exemple `programme-maths-6e.pdf.meta`), sans les `---`.
Les lignes commençant par `#` sont des commentaires.

```
---
document_id: BF-MATH-6E-PROG-002
titre: Programme de mathématiques — classe de 6e
organisme: [ministère / direction émettrice]
pays: Burkina Faso
niveau: 6e
classes: 6e
matieres: Mathématiques
type: programme officiel
annee: [année de publication]
version: [numéro ou intitulé de version]
statut: [ex. : programme en vigueur]
etat: actif
remplace: BF-MATH-6E-PROG-001
fiabilite: 1
source: [site, service, référence du document]
date_integration: 2026-09-28
date_mise_a_jour: 2026-09-28
date_expiration:
avertissement: [facultatif — règle d'usage propre à ce document, sur une seule ligne]
---
(texte du document)
```

| Rubrique | Rôle |
|---|---|
| `document_id` | Identifiant unique et stable (ex. `BF-MATH-6E-GUIDE-001`). Indispensable pour gérer les versions. |
| `classes`, `matieres` | Filtrent les documents applicables à la classe et à la discipline de l'enseignant. Plusieurs valeurs séparées par des virgules ; vide = toutes. |
| `annee`, `version`, `statut` | Transmis au modèle et affichés à l'enseignant. |
| `etat` | `actif` (par défaut), `archive`, `remplace` ou `declasse`. Seuls les documents actifs sont consultés. |
| `remplace` | Identifiant(s) du ou des documents que celui-ci remplace : ils passent automatiquement en archive. |
| `fiabilite` | Hiérarchie des sources (section 7) : 1 document officiel du ministère, 2 programme / guide officiellement reconnu, 3 document institutionnel complémentaire, 4 ressource secondaire fiable. À pertinence égale, le plus fiable passe devant. |
| `date_expiration` | Au-delà de cette date, le document passe en archive. |
| `avertissement` | Règle d'usage que KIBARU doit respecter pour ce document (ex. : « document ancien, ne pas présenter comme le programme en vigueur »). |

Une valeur `à renseigner` est ignorée : n'inventez jamais une année ou une version.

## Ajouter une nouvelle version (sections 6 et 22)

1. Déposez le nouveau document avec un **nouvel** `document_id` (ex. `…-002`) et `remplace: <ancien identifiant>`.
2. Laissez l'ancien fichier en place : il est conservé comme archive, n'est plus consulté, et KIBARU sait qu'une
   version plus récente existe.
3. Le remplacement n'est jamais deviné d'après les titres : il n'a lieu que si `remplace` est renseigné, pour que la
   nouvelle version ne soit privilégiée que lorsque son statut est clairement établi.

## Prise en compte

Les documents sont lus au démarrage du serveur. Après un ajout : redéployez (Vercel) ou redémarrez l'application.
Ce fichier `LISEZ-MOI.md` n'est pas lu comme document de référence.

Exemple de fiche : [`mathematiques/BF_MATH_6E_GUIDE_PEDAGOGIQUE_REFERENCE.pdf.meta`](mathematiques/BF_MATH_6E_GUIDE_PEDAGOGIQUE_REFERENCE.pdf.meta)
(le PDF correspondant reste à déposer).
