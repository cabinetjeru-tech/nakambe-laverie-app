-- ============================================================================
-- SALONS-SAAS — Vérification des garanties de la base (isolation, anti-double-booking…)
--
-- À lancer par un superutilisateur sur une base de TEST migrée, après roles.sql :
--   psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/sql/verification.sql
--
-- Tout s'exécute dans une transaction annulée à la fin : la base n'est pas modifiée.
-- Chaque contrôle lève une exception en cas d'échec ; sinon « OK … » s'affiche.
-- ============================================================================
BEGIN;

-- Jeu de données minimal : deux tenants concurrents A et B (inséré par le propriétaire, hors RLS).
INSERT INTO plans (id, code, name, price_monthly, price_yearly, updated_at)
VALUES ('00000000-0000-7000-8000-000000000001', 'TEST', 'Test', 0, 0, now());

INSERT INTO tenants (id, slug, legal_name, display_name, plan_id, data_key_enc, updated_at) VALUES
  ('0000000a-0000-7000-8000-000000000000', 'salon-a', 'A SARL', 'Salon A', '00000000-0000-7000-8000-000000000001', 'k', now()),
  ('0000000b-0000-7000-8000-000000000000', 'salon-b', 'B SARL', 'Salon B', '00000000-0000-7000-8000-000000000001', 'k', now());

INSERT INTO users (id, phone, full_name, updated_at) VALUES
  ('000000c0-0000-7000-8000-000000000000', '+22670000001', 'Coiffeur A', now());

INSERT INTO salons (id, tenant_id, slug, name, city, updated_at) VALUES
  ('0000a001-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', 'centre', 'A Centre', 'Ouagadougou', now()),
  ('0000b001-0000-7000-8000-000000000000', '0000000b-0000-7000-8000-000000000000', 'centre', 'B Centre', 'Tenkodogo', now());

INSERT INTO memberships (id, tenant_id, user_id) VALUES
  ('0000a0e1-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', '000000c0-0000-7000-8000-000000000000');

INSERT INTO staff_members (id, tenant_id, display_name, updated_at) VALUES
  ('0000a0f1-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', 'Awa', now()),
  ('0000b0f1-0000-7000-8000-000000000000', '0000000b-0000-7000-8000-000000000000', 'Binta', now());

INSERT INTO service_categories (id, tenant_id, name) VALUES
  ('0000a0ca-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', 'Tresses');
INSERT INTO services (id, tenant_id, category_id, name, base_price, duration_minutes, updated_at) VALUES
  ('0000a05e-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', '0000a0ca-0000-7000-8000-000000000000', 'Nattes', 5000, 120, now());

INSERT INTO appointments (id, tenant_id, salon_id, reference, channel, starts_at, ends_at, estimated_total, updated_at) VALUES
  ('0000a0a1-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', '0000a001-0000-7000-8000-000000000000',
   'RDV-1', 'COUNTER', '2026-10-01 09:00+00', '2026-10-01 13:00+00', 10000, now());
INSERT INTO appointment_items (id, tenant_id, appointment_id, service_id, staff_id, position, service_name, starts_at, ends_at, duration_minutes, price) VALUES
  ('0000a0b1-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', '0000a0a1-0000-7000-8000-000000000000',
   '0000a05e-0000-7000-8000-000000000000', '0000a0f1-0000-7000-8000-000000000000', 1, 'Nattes', '2026-10-01 09:00+00', '2026-10-01 11:00+00', 120, 5000),
  ('0000a0b2-0000-7000-8000-000000000000', '0000000a-0000-7000-8000-000000000000', '0000a0a1-0000-7000-8000-000000000000',
   '0000a05e-0000-7000-8000-000000000000', '0000a0f1-0000-7000-8000-000000000000', 2, 'Nattes', '2026-10-01 11:00+00', '2026-10-01 13:00+00', 120, 5000);

-- 1. Clés étrangères composites : impossible de rattacher une donnée de A à un salon de B.
DO $$
BEGIN
  BEGIN
    INSERT INTO appointments (id, tenant_id, salon_id, reference, channel, starts_at, ends_at, estimated_total, updated_at)
    VALUES (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000b001-0000-7000-8000-000000000000',
            'X', 'COUNTER', now(), now() + interval '1 hour', 0, now());
    RAISE EXCEPTION 'ÉCHEC : un RDV du tenant A a pu pointer vers un salon du tenant B';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'OK 1 — clé étrangère composite : rattachement inter-tenant refusé';
  END;
END $$;

-- 2 à 4. RLS, exécutée avec le rôle de l'API.
SET LOCAL ROLE salons_app;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM salons;
  IF n <> 0 THEN RAISE EXCEPTION 'ÉCHEC : % salons visibles sans contexte tenant', n; END IF;
  RAISE NOTICE 'OK 2 — sans contexte tenant, aucune ligne visible';
END $$;

SELECT set_config('app.tenant_id', '0000000a-0000-7000-8000-000000000000', true),
       set_config('app.user_id', '000000c0-0000-7000-8000-000000000000', true);

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM salons;
  IF n <> 1 THEN RAISE EXCEPTION 'ÉCHEC : le tenant A voit % salons (attendu 1)', n; END IF;
  SELECT count(*) INTO n FROM salons WHERE tenant_id = '0000000b-0000-7000-8000-000000000000';
  IF n <> 0 THEN RAISE EXCEPTION 'ÉCHEC : le tenant A voit les salons de B'; END IF;
  UPDATE staff_members SET display_name = 'piraté' WHERE id = '0000b0f1-0000-7000-8000-000000000000';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'ÉCHEC : le tenant A a modifié un employé de B'; END IF;
  RAISE NOTICE 'OK 3 — RLS : A ne lit ni ne modifie les données de B';

  BEGIN
    INSERT INTO client_profiles (id, tenant_id, client_number, full_name, updated_at)
    VALUES (gen_random_uuid(), '0000000b-0000-7000-8000-000000000000', 'C1', 'Intrus', now());
    RAISE EXCEPTION 'ÉCHEC : A a pu écrire dans le tenant B';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK 4 — RLS : écriture dans un autre tenant refusée';
  END;
END $$;

-- 5. Anti-double-booking.
DO $$
BEGIN
  INSERT INTO staff_busy_slots (id, tenant_id, staff_id, item_id, starts_at, ends_at) VALUES
    (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000a0f1-0000-7000-8000-000000000000',
     '0000a0b1-0000-7000-8000-000000000000', '2026-10-01 09:00+00', '2026-10-01 10:00+00'),
    -- créneau contigu : autorisé (bornes [début, fin[)
    (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000a0f1-0000-7000-8000-000000000000',
     '0000a0b2-0000-7000-8000-000000000000', '2026-10-01 10:00+00', '2026-10-01 10:30+00');
  BEGIN
    INSERT INTO staff_busy_slots (id, tenant_id, staff_id, item_id, starts_at, ends_at) VALUES
      (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000a0f1-0000-7000-8000-000000000000',
       '0000a0b2-0000-7000-8000-000000000000', '2026-10-01 09:30+00', '2026-10-01 10:15+00');
    RAISE EXCEPTION 'ÉCHEC : chevauchement accepté pour un même coiffeur';
  EXCEPTION WHEN exclusion_violation THEN
    RAISE NOTICE 'OK 5 — anti-double-booking : chevauchement refusé, créneaux contigus acceptés';
  END;
  -- Une occupation annulée (is_active = false) ne bloque plus le créneau.
  INSERT INTO staff_busy_slots (id, tenant_id, staff_id, item_id, starts_at, ends_at, is_active) VALUES
    (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000a0f1-0000-7000-8000-000000000000',
     '0000a0b2-0000-7000-8000-000000000000', '2026-10-01 09:30+00', '2026-10-01 10:15+00', false);
  RAISE NOTICE 'OK 6 — une occupation annulée libère le créneau';
END $$;

-- 7. Registre équilibré (contrôle différé forcé immédiatement pour le test).
DO $$
DECLARE g uuid := gen_random_uuid();
BEGIN
  INSERT INTO ledger_entries (id, tenant_id, salon_id, transaction_group, account, debit, credit, currency) VALUES
    (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000a001-0000-7000-8000-000000000000', g, 'CASH', 5000, 0, 'XOF'),
    (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000a001-0000-7000-8000-000000000000', g, 'REVENUE_SERVICES', 0, 5000, 'XOF');
  SET CONSTRAINTS ledger_entries_balanced IMMEDIATE;
  SET CONSTRAINTS ledger_entries_balanced DEFERRED;
  BEGIN
    INSERT INTO ledger_entries (id, tenant_id, salon_id, transaction_group, account, debit, credit, currency) VALUES
      (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', '0000a001-0000-7000-8000-000000000000', gen_random_uuid(), 'CASH', 3000, 0, 'XOF');
    SET CONSTRAINTS ledger_entries_balanced IMMEDIATE;
    RAISE EXCEPTION 'ÉCHEC : écriture déséquilibrée acceptée';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'OK 7 — registre : écriture équilibrée acceptée, déséquilibrée refusée';
  END;
  SET CONSTRAINTS ledger_entries_balanced DEFERRED;
END $$;

-- 8. Journal d'audit en ajout seul.
DO $$
BEGIN
  INSERT INTO audit_logs (id, tenant_id, action, entity_type) VALUES
    (gen_random_uuid(), '0000000a-0000-7000-8000-000000000000', 'test', 'test');
  BEGIN
    UPDATE audit_logs SET action = 'effacé';
    RAISE EXCEPTION 'ÉCHEC : journal d''audit modifiable';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK 8 — journal d''audit non modifiable';
  END;
END $$;

-- 9. Un utilisateur voit ses adhésions dans tous les tenants, même hors contexte tenant.
SELECT set_config('app.tenant_id', '', true);
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM memberships;
  IF n <> 1 THEN RAISE EXCEPTION 'ÉCHEC : % adhésions visibles pour l''utilisateur (attendu 1)', n; END IF;
  SELECT count(*) INTO n FROM salons;
  IF n <> 0 THEN RAISE EXCEPTION 'ÉCHEC : contexte vide mais salons visibles'; END IF;
  RAISE NOTICE 'OK 9 — adhésions personnelles visibles, reste des données masqué';
END $$;

RESET ROLE;
ROLLBACK;
