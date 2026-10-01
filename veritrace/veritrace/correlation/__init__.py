"""Corrélation — PROCHAINE ITÉRATION.

Interface prévue :
- fusion des `artifacts[]` de tous les wrappers ;
- regroupement par `content_sha256` → statut « corroborated » si ≥ 2 outils distincts ;
- timeline unifiée (`timeline[]`) triée, avec drapeaux (IOC, app suspecte, trou temporel,
  changement d'horloge) ;
- règles de détection → `findings[]`.
"""
