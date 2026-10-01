# Séparer les applications du dépôt

Le dépôt `nakambe-laverie-app` contient plusieurs applications, chacune dans son dossier :

| Dossier | Application | Base de données |
|---|---|---|
| `kibaru-faso/` | PÉDAGOGUE.IA (pedagogue-ia.vercel.app) | Supabase « pedagogue-ia » |
| `nourou-academy/` | Akambi / Nourou Academy | Supabase « Nourou Global Consulting » |
| `frontend/`, `backend/` | Laverie Nakambe | — |
| `allo-coursier/` | Allo Coursier | — |

Les bases de données sont déjà séparées : une application ne peut pas lire ni modifier les données d'une autre.

Le problème venait de Vercel. Chaque envoi de code relançait **tous** les projets Vercel reliés au dépôt, même quand une seule application avait changé. Le quota gratuit de déploiements était alors vite épuisé, et l'application voisine se retrouvait bloquée.

## Ce qui est réglé dans le code

Chaque application a maintenant, dans son `vercel.json`, une règle « Ignored Build Step ». Avec cette règle, Vercel ne reconstruit l'application **que si son propre dossier a changé** :

- `kibaru-faso/vercel.json` : seulement sur `main`, et seulement si `kibaru-faso/` a changé ;
- `nourou-academy/vercel.json` : seulement si `nourou-academy/` a changé ;
- `frontend/vercel.json` : seulement si `frontend/` a changé.

## À vérifier une fois dans Vercel (2 minutes par projet)

Pour chaque projet (pedagogue-ia, akambi-academy, nakambe-laverie-app, nakambe-app-2026) :

1. Ouvrez **Settings → Build and Deployment → Root Directory**. Le dossier doit être celui de l'application (`kibaru-faso` pour pedagogue-ia, `nourou-academy` pour akambi-academy, etc.). Sinon, la règle de `vercel.json` n'est pas lue.
2. Dans la même page, section **Ignored Build Step**, laissez « Automatic ». Le `vercel.json` du dossier est alors appliqué. Un réglage saisi à la main dans Vercel remplace celui du fichier.
3. Un projet que vous n'utilisez plus (par exemple un doublon comme `nakambe-app-2026`) : **Settings → Git → Disconnect**. Il ne consommera plus aucun déploiement.

## Pour une séparation complète (facultatif)

Si vous voulez qu'aucun projet ne voie les autres, placez chaque application dans **son propre dépôt GitHub**, par exemple `pedagogue-ia` pour le dossier `kibaru-faso/`. Reliez ensuite chaque projet Vercel à son dépôt. Je peux préparer ce découpage quand vous le souhaitez. Il faudra seulement créer le nouveau dépôt sur GitHub et me donner l'accès.
