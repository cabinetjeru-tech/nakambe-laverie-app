# Bibliothèque de référence de KIBARU FASO

Déposez ici les documents officiels sur lesquels KIBARU FASO doit s'appuyer : programmes, curricula, guides
pédagogiques, progressions officielles, référentiels, documents d'accompagnement.

**N'y déposez que des documents authentiques, dont vous connaissez l'origine.** KIBARU FASO présente leur contenu
comme « SOURCE » : un document inexact deviendrait une fausse référence officielle.

## Formats acceptés

- `.md` ou `.txt` (recommandé : le texte est lu sans erreur) ;
- `.pdf` (PDF contenant du texte ; un PDF scanné en image ne peut pas être lu) ;
- `.docx` (Word).

Les sous-dossiers sont permis, par exemple `mathematiques/`, `francais/`, `svt/`.

## Décrire chaque document (fortement recommandé)

Les métadonnées permettent de n'utiliser que les documents applicables à la classe et à la discipline de
l'enseignant, et de citer correctement la source.

Pour un fichier `.md` ou `.txt`, en tête du fichier :

```
---
titre: Programme de mathématiques — classe de 6e
type: programme officiel
classes: 6e
disciplines: Mathématiques
source: [Ministère / direction émettrice], [année]
---
(texte du document)
```

Pour un `.pdf` ou un `.docx`, dans un fichier voisin portant le même nom suivi de `.meta`
(par exemple `programme-maths-6e.pdf.meta`) avec les mêmes lignes, sans les `---`.

`classes` et `disciplines` acceptent plusieurs valeurs séparées par des virgules. Laissez-les vides pour un
document qui concerne toutes les classes ou toutes les disciplines (par exemple un guide général d'évaluation).

## Prise en compte

Les documents sont lus au démarrage du serveur. Après un ajout : redéployez (Vercel) ou redémarrez l'application.
Ce fichier `LISEZ-MOI.md` n'est pas lu comme document de référence.
