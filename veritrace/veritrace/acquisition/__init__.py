"""Acquisition logique via ADB — PROCHAINE ITÉRATION.

Interface prévue :
- `adb devices` / `getprop` → fiche appareil (`devices[]`) ; refus si l'appareil n'est pas
  autorisé (« unauthorized ») : aucune tentative de contournement.
- `adb backup` et `adb pull` ciblé → `acquisition/raw/<ACQ-ID>/`.
- Chaque fichier : SHA-256 à la collecte → `evidence_items[]` + événement de custody
  « collected » (qui, quoi, quand, empreinte) + entrée d'audit.
ADB absent → avertissement (voir core.tools.require), jamais de crash.
"""
