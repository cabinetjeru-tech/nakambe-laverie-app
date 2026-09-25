# 04 — Sécurité et protection des données

## 1. Mesures en place

| Domaine | Mesure |
|---|---|
| Authentification | Mots de passe bcrypt (coût 12), règle de robustesse ; session = jeton aléatoire 256 bits en cookie `httpOnly`, `SameSite=Lax`, `Secure` en HTTPS ; seule l'empreinte SHA-256 est stockée ; révocation à la déconnexion, à la suspension et au changement de mot de passe par lien |
| Anti-abus | Limites de débit : connexion (IP et compte), inscription, mot de passe oublié, contact, tuteur, voix, quiz, devoirs, téléversements, webhooks, vérification de certificats ; champ piège anti-robot sur le contact ; messages génériques (pas d'énumération de comptes) |
| Contrôle d'accès | Vérifié côté serveur dans chaque page, action et route (`access.ts`, `permissions.ts`) ; le middleware ne fait qu'une redirection de confort. Le RAG ne récupère que les passages des formations autorisées. Les réponses correctes des quiz ne sont jamais envoyées au navigateur |
| Injections | Requêtes Prisma paramétrées (y compris le SQL brut via gabarits) ; validation Zod des entrées ; Markdown rendu par échappement systématique (pas de HTML brut, liens `javascript:` impossibles) ; exports CSV protégés contre l'injection de formules |
| En-têtes | CSP stricte (Jitsi autorisé), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, HSTS en production, `X-Powered-By` retiré ; `noindex` sur admin et formateur |
| Fichiers | Type réel détecté par signature binaire, taille maximale, noms aléatoires, fichiers privés servis uniquement par URL signée HMAC à durée limitée, `Content-Disposition` et `CSP: sandbox` pour les documents |
| Secrets | Clés API chiffrées AES-256-GCM en base, jamais renvoyées au navigateur (masque), jamais journalisées |
| Paiements | Prix calculé côté serveur ; notifications authentifiées (HMAC / hash) ; statut confirmé par l'API du prestataire (montant, devise, référence) ; attribution idempotente ; la page de retour n'est jamais une preuve |
| IA | Contenus de cours et messages traités comme des données (consignes anti-injection) ; quotas et budget ; journal d'usage sans contenu ; certificats jamais délivrés par l'IA |
| Base de données | RLS activé sur toutes les tables ; si la base est exposée par une API automatique (Supabase PostgREST), les rôles `anon`/`authenticated` ne lisent que le catalogue public ; secrets, utilisateurs, sessions et index RAG leur sont interdits |
| Traçabilité | Journal d'audit des opérations administratives (rôles, prix, validations, remboursements, paramètres, exports, suppressions de compte) |

Limite connue : le limiteur de débit est en mémoire (une instance). Pour plusieurs instances, le remplacer par Redis
(`src/lib/rate-limit.ts`).

## 2. Données personnelles

Fonctions disponibles pour les personnes concernées : consentement à l'inscription (conditions + confidentialité,
communications commerciales séparées et facultatives), modification du profil, **export JSON** de ses données,
**suppression / anonymisation** du compte (les factures sont conservées de façon anonymisée pour les obligations
comptables), suppression de ses conversations avec le tuteur.

Minimisation : pas de code Mobile Money ni de donnée de carte stockés ; pièces jointes envoyées au tuteur analysées
puis non conservées ; les administrateurs ne voient pas le contenu des conversations avec le tuteur.

## 3. Obligations à vérifier (non juridique — à faire valider)

- **Burkina Faso** : loi n° 001-2021/AN du 30 mars 2021 portant protection des personnes à l'égard du traitement des
  données à caractère personnel ; autorité : Commission de l'Informatique et des Libertés (**CIL**). Formalités
  préalables (déclaration / autorisation) et encadrement des transferts hors du pays à vérifier.
- **Bénin** : Code du numérique (loi n° 2017-20) ; autorité : Autorité de Protection des Données à caractère
  Personnel (**APDP**).
- Autres pays ciblés : vérifier la législation et l'autorité locales.
- Transferts vers des prestataires hors d'Afrique (fournisseur d'IA, email, hébergement, stockage) : informer les
  utilisateurs (fait dans la politique de confidentialité) et contractualiser les garanties nécessaires.
- Factures : compléter les mentions légales (IFU, RCCM, régime fiscal) selon le statut de l'entreprise.
- Certificats : ne pas les présenter comme des diplômes d'État sans accréditation officielle (mention présente sur
  les certificats, la page de vérification, les CGU et le pied de page).
