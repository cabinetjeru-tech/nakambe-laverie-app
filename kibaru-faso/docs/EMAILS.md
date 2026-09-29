# E-mails automatiques (Brevo)

PÉDAGOGUE.IA envoie deux familles d'e-mails :

| E-mail | Envoyé par | Quand |
|---|---|---|
| Confirmation d'adresse, mot de passe oublié | Supabase (Auth) | inscription, « Mot de passe oublié » |
| Bienvenue | l'application | première connexion (adresse confirmée) |
| Paiement confirmé + lien du reçu | l'application | paiement CinetPay réussi |
| Nouveau paiement (alerte) | l'application | à chaque adresse de `ADMIN_EMAILS` |
| Commission gagnée | l'application | paiement réussi d'un filleul |
| Fin de l'essai gratuit (+ code promo actif) | tâche quotidienne | chaque matin à 8 h (Ouagadougou) |
| Fin d'abonnement dans ≤ 3 jours | tâche quotidienne | idem (pas pour le pass de 24 h) |

Chaque e-mail n'est envoyé qu'une fois (table `emails_envoyes`). Sans clé Brevo, rien n'est envoyé et l'application fonctionne normalement.

## 1. Compte Brevo (gratuit : 300 e-mails par jour)

1. Créer un compte sur <https://www.brevo.com> avec **megavision.gca@gmail.com**.
2. **Expéditeurs** (Senders, Domains & Dedicated IPs → Senders) : ajouter `megavision.gca@gmail.com`, nom « PÉDAGOGUE.IA », et valider le lien reçu.
3. **SMTP & API** → onglet **API keys** → *Generate a new API key* → copier la clé (`xkeysib-…`).
4. Même page, onglet **SMTP** : noter le *Login* (ex. `8a1b2c001@smtp-brevo.com`) et générer une *SMTP key* (pour l'étape 3).

> Avec une adresse Gmail comme expéditeur, une partie des messages peut arriver en « Promotions » ou en spam. Un nom de domaine
> (ex. `pedagogue-ia.bf`) authentifié dans Brevo règle ce point : `EMAIL_EXPEDITEUR=contact@pedagogue-ia.bf`.

## 2. Variables Vercel (projet pedagogue-ia → Settings → Environment Variables)

| Variable | Valeur |
|---|---|
| `BREVO_API_KEY` | la clé API `xkeysib-…` |
| `EMAIL_EXPEDITEUR` | `megavision.gca@gmail.com` (adresse validée dans Brevo) |
| `CRON_SECRET` | une longue chaîne aléatoire (Vercel l'envoie à la tâche quotidienne) |

Puis redéployer. Vérification : `/admin` → Tableau → **Envoyer un e-mail de test**.

## 3. E-mails de Supabase (confirmation, mot de passe) — indispensable avant la campagne

Le service d'e-mail intégré de Supabase est limité à **quelques messages par heure** : au-delà, les inscriptions échouent.
Dans Supabase → **Authentication → Emails → SMTP Settings** → *Enable custom SMTP* :

| Champ | Valeur |
|---|---|
| Sender email | `megavision.gca@gmail.com` |
| Sender name | `PÉDAGOGUE.IA` |
| Host | `smtp-relay.brevo.com` |
| Port | `587` |
| Username | le *Login* SMTP Brevo |
| Password | la *SMTP key* Brevo |

Puis **Authentication → Rate Limits** : passer « emails sent per hour » à 200 ou plus.

### Modèles en français (Authentication → Emails → Templates)

**Confirm signup** — sujet : `Confirmez votre adresse — PÉDAGOGUE.IA`

```html
<h2>Bienvenue sur PÉDAGOGUE.IA</h2>
<p>Cliquez sur le lien ci-dessous pour confirmer votre adresse et démarrer vos 24 h d'essai gratuit :</p>
<p><a href="{{ .ConfirmationURL }}">Confirmer mon adresse</a></p>
<p>Si vous n'avez pas créé de compte, ignorez ce message.</p>
<p>MEGAVISION, Ouagadougou · +226 03 70 37 17</p>
```

**Reset password** — sujet : `Nouveau mot de passe — PÉDAGOGUE.IA`

```html
<h2>Mot de passe oublié</h2>
<p>Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :</p>
<p><a href="{{ .ConfirmationURL }}">Choisir un nouveau mot de passe</a></p>
<p>Si vous n'avez rien demandé, ignorez ce message.</p>
<p>MEGAVISION, Ouagadougou · +226 03 70 37 17</p>
```
