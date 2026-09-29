# Brancher un nom de domaine (ex. pedagogue-ia.com)

Un nom de domaine rend la plateforme plus professionnelle, plus facile à retenir et à partager, et permet d'envoyer
les e-mails depuis sa propre adresse (contact@pedagogue-ia.com) au lieu d'une adresse « brevosend.com ».

## 1. Acheter le domaine (le plus simple : dans Vercel)

Vercel → projet **pedagogue-ia** → **Settings → Domains** → **Buy** (ou vercel.com/domains) → chercher `pedagogue-ia.com`
(environ 10 à 15 $ par an, payé par carte). Le domaine est alors relié automatiquement au site, avec le certificat HTTPS.

> Un domaine `.bf` est aussi possible (auprès d'un bureau d'enregistrement agréé au Burkina) : il faut alors ajouter dans Vercel
> le domaine (Settings → Domains → Add) et recopier chez le bureau d'enregistrement les enregistrements DNS que Vercel indique.

Dans Settings → Domains, garder `pedagogue-ia.vercel.app` et le faire **rediriger** vers le nouveau domaine : les liens déjà
partagés continuent de fonctionner.

## 2. Variables Vercel (Settings → Environment Variables), puis redéployer

| Variable | Nouvelle valeur |
|---|---|
| `APP_URL` | `https://pedagogue-ia.com` |
| `NEXT_PUBLIC_APP_URL` | `https://pedagogue-ia.com` (liens de parrainage, messages de campagne, plan du site) |
| `EMAIL_EXPEDITEUR` | `contact@pedagogue-ia.com` (après l'étape 4) |

L'adresse de notification CinetPay suit automatiquement `APP_URL`.

## 3. Supabase (Authentication → URL Configuration)

- **Site URL** : `https://pedagogue-ia.com`
- **Redirect URLs** : ajouter `https://pedagogue-ia.com/**` (garder l'ancienne adresse pendant la transition).

Sinon les liens de confirmation d'inscription et de mot de passe renverraient vers l'ancienne adresse.

## 4. Brevo : e-mails depuis votre domaine

Brevo → **Expéditeurs, domaines et IP dédiées → Domaines → Ajouter un domaine** → `pedagogue-ia.com` → Brevo affiche
3 ou 4 enregistrements DNS (code Brevo, DKIM, DMARC). Les ajouter dans Vercel → **Domains → pedagogue-ia.com → DNS Records**,
puis cliquer sur « Vérifier » dans Brevo. Créer ensuite l'expéditeur `contact@pedagogue-ia.com` et mettre à jour
`EMAIL_EXPEDITEUR` (et le « Sender email » du SMTP dans Supabase).

## 5. Google

Sur <https://search.google.com/search-console>, ajouter le domaine, puis soumettre le plan du site :
`https://pedagogue-ia.com/sitemap.xml`. Les fiches gratuites (/fiches) apparaîtront progressivement dans les résultats.
