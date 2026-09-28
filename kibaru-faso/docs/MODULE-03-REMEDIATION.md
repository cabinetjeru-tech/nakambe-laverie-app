# Module 03 — Générateur de remédiation : mise en œuvre

Conçu à partir des règles déjà validées : remédiation du prompt initial (§ 10 : difficulté, cause possible,
prérequis, diagnostic, remédiation, exercices progressifs, correction, nouvelle évaluation), de la configuration V2
(§ 16), du moteur pédagogique (§ 15 : + consolidation) et du Module 01 (§ 16 : rappel visuel, exemple simple,
exercice guidé, exercice autonome ; § 17 : différenciation jamais figée). À ajuster si un cahier des charges détaillé
du Module 03 est fourni.

## Parcours

- **Demande libre** : « Mes élèves de 5e confondent périmètre et aire, propose une remédiation pour un petit groupe en
  deux séances ». Le moteur reconnaît la classe, la matière (déduite du thème), le public (un élève, un petit groupe,
  toute la classe), le nombre de séances et vérifie que la difficulté est décrite. Sinon, une seule question :
  « Quelle difficulté avez-vous observée chez vos élèves (notion concernée et erreurs typiques) ? »
- **Formulaire « Générateur de remédiation »** (accueil, carte « Une activité de remédiation ») : classe, discipline,
  notion et difficulté observée (requis), exemple d'erreur d'élève, public, élèves concernés, durée, matériel,
  différenciation en trois niveaux, consolidation à la maison.

## Démarche produite (prompt, bloc MODULE 03)

1. Difficulté identifiée · 2. Causes possibles (hypothèses, jamais un diagnostic certain) · 3. Prérequis à vérifier ·
4. Activité diagnostique (ce que révèle chaque erreur) · 5. Activités de remédiation (matériel concret, exemple simple,
exercice guidé, exercice autonome ; organisation élève / groupe / classe, groupes de besoin temporaires et tutorat en
classe pléthorique) · 6. Exercices progressifs · 7. Corrigé · 8. Nouvelle vérification avec critère de réussite ·
9. Consolidation — puis statut des informations et point à vérifier.

## Contrôle automatique (affiché sous la réponse)

| Contrôle | Exemple de signal |
|---|---|
| Les 9 étapes sont présentes | « Étape(s) de la remédiation non repérée(s) : Consolidation. » |
| Causes formulées comme hypothèses | « Les causes de la difficulté semblent présentées comme certaines… » |
| Vocabulaire non stigmatisant | « Vocabulaire stigmatisant repéré (ex. « élèves faibles »…) » |
| Critère de réussite de la nouvelle vérification | « Nouvelle vérification sans critère de réussite… » |
| Calculs du corrigé (seulement le corrigé : les erreurs d'élèves citées en exemple ne sont pas « corrigées ») | « Calcul(s) à vérifier dans le corrigé : 3 × 4 = 7 (on trouve 12). » |

## Commandes sous une remédiation

Plus simple · Ajouter des exercices · Pour un seul élève · Pour toute la classe · Avec du matériel concret ·
Nouvelle vérification · Fiche élève imprimable · Tutorat entre pairs.
