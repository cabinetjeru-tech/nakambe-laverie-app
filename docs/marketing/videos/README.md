# Vidéos d'octobre — Nouvelle Laverie Africaine

Vidéos animées (personnages dessinés, textes à l'écran, sous-titres incrustés), **sans voix** :
la piste son est muette. Pour ajouter la voix, ouvrir la vidéo dans CapCut et enregistrer
le texte du script (`../scripts-octobre.html`, colonne « Ce qu'on entend ») en suivant les sous-titres.

| Date | Fichier | Format | Titre |
|---|---|---|---|
| Lun. 5 oct. | `v01-9x16.mp4` | Short vertical | Tache d'huile sur un pagne : 3 gestes avant de laver |
| Mer. 7 oct. | `v02-16x9.mp4` | Horizontal | Trier son linge comme un pro |
| Sam. 10 oct. | `spot-lavage-mobile-9x16.mp4` | Short vertical | La laverie vient laver chez vous : 40 habits pour 2 000 FCFA |
| Lun. 12 oct. | `v04-9x16.mp4` | Short vertical | Lire une étiquette d'entretien en moins d'une minute |
| Mer. 14 oct. | `v05-16x9.mp4` | Horizontal | Laver sa moto après la pluie |
| Sam. 17 oct. | `v06-16x9.mp4` | Horizontal | Académie NLA n°1 : bien accueillir un client au comptoir |
| Lun. 19 oct. | `v07-9x16.mp4` | Short vertical | 4 erreurs qui rayent votre voiture au lavage |
| Mer. 21 oct. | `v08-16x9.mp4` | Horizontal | Repasser un boubou en bazin sans le faire briller |
| Sam. 24 oct. | `v09-16x9.mp4` | Horizontal | Commander en ligne et suivre son linge |
| Lun. 26 oct. | `v10-9x16.mp4` | Short vertical | Baskets blanches : lavage et désinfection UV |
| Mer. 28 oct. | `v11-16x9.mp4` | Horizontal | Harmattan : protéger la carrosserie |
| Sam. 31 oct. | `v12-16x9.mp4` | Horizontal | Académie NLA n°2 : doser la lessive |

Les descriptions YouTube à coller se trouvent dans `../scripts-octobre.html`.

## Modifier une vidéo

Chaque vidéo a sa source dans `src/` (page HTML animée : fonction `render(t)`, durée dans `TOTAL`).
Le texte vient des scripts : corriger le script, puis régénérer la page et la vidéo
(capture image par image avec Playwright, encodage H.264 avec ffmpeg, 25 images/s).
