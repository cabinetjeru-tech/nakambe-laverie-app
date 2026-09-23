-- Événements d'audit de niveau plateforme (tenant_id NULL) : inscription d'un client,
-- réinitialisation de mot de passe, connexion hors tenant…
-- L'API (salons_app) peut les ÉCRIRE mais pas les relire : seule la console éditeur
-- (salons_platform, BYPASSRLS) y a accès. Les politiques permissives se cumulent (OU).
CREATE POLICY platform_audit_insert ON audit_logs
  FOR INSERT WITH CHECK (tenant_id IS NULL);
