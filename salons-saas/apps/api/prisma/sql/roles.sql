-- ============================================================================
-- SALONS-SAAS — Rôles PostgreSQL de connexion
-- À exécuter UNE FOIS par l'administrateur de la base, après les migrations, en
-- remplaçant les mots de passe. (Hors migrations Prisma : la création de rôles exige
-- des droits que l'utilisateur de migration n'a pas toujours chez un hébergeur.)
--
--   psql "$ADMIN_DATABASE_URL" -v app_password="'...'" -v platform_password="'...'" -f prisma/sql/roles.sql
--
-- Trois identités :
--   propriétaire des tables : exécute les migrations (DATABASE_MIGRATION_URL) ; RLS ne s'applique pas à lui
--   salons_app              : l'API et le worker (DATABASE_URL) ; SOUMIS à RLS
--   salons_platform         : console éditeur, tâches inter-tenants (facturation SaaS, purge,
--                             statistiques plateforme) ; BYPASSRLS, jamais exposé aux requêtes des salons
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salons_app') THEN
    CREATE ROLE salons_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salons_platform') THEN
    CREATE ROLE salons_platform LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

ALTER ROLE salons_app PASSWORD :app_password;
ALTER ROLE salons_platform PASSWORD :platform_password;

GRANT USAGE ON SCHEMA public TO salons_app, salons_platform;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO salons_app, salons_platform;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO salons_app, salons_platform;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO salons_app, salons_platform;

-- Tables futures créées par le propriétaire (migrations suivantes).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO salons_app, salons_platform;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO salons_app, salons_platform;

-- Double protection des tables en ajout seul (en plus des triggers).
REVOKE UPDATE, DELETE ON audit_logs, ledger_entries, stock_movements, client_consents, appointment_status_history
  FROM salons_app;

-- L'API n'a pas à modifier le catalogue des offres ni les comptes du personnel plateforme.
REVOKE INSERT, UPDATE, DELETE ON plans, plan_features, platform_staff, permissions FROM salons_app;
