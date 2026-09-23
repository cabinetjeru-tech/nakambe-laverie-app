-- ============================================================================
-- SALONS-SAAS — Garanties portées par PostgreSQL (non exprimables dans Prisma)
--
--  1. Fonctions de contexte (tenant et utilisateur courants)
--  2. Row-Level Security sur toutes les tables portant tenant_id
--  3. Anti-double-booking : colonnes tstzrange générées + contraintes d'exclusion GiST
--  4. Contraintes CHECK métier (montants, dates, notes…)
--  5. Tables en ajout seul (audit, registre, mouvements de stock, consentements)
--  6. Registre équilibré (débits = crédits par transaction_group)
--
-- Les rôles PostgreSQL de connexion sont créés hors migration : voir prisma/sql/roles.sql.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Contexte
-- L'API ouvre chaque transaction par :
--   SELECT set_config('app.tenant_id', '<uuid>', true), set_config('app.user_id', '<uuid>', true);
-- (équivalent de SET LOCAL : la valeur disparaît à la fin de la transaction, même avec un pool.)
-- NULLIF gère la valeur '' que PostgreSQL renvoie une fois un réglage local expiré.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid $$;

CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;

-- ---------------------------------------------------------------------------
-- 2. Row-Level Security
-- Toute table possédant une colonne tenant_id reçoit la politique d'isolation.
-- RLS est « ENABLE » (pas « FORCE ») : le propriétaire des tables (utilisé par les
-- migrations) n'est pas filtré ; l'API se connecte avec le rôle salons_app, soumis à RLS.
-- Sans contexte tenant, app_current_tenant_id() est NULL → aucune ligne visible.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'tenant_id'
      AND tb.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = app_current_tenant_id())
         WITH CHECK (tenant_id = app_current_tenant_id())', t);
  END LOOP;
END $$;

-- Exceptions en lecture : un utilisateur voit ses propres adhésions et fiches client dans
-- tous les tenants (choix du salon à la connexion, espace client multi-salons).
-- Les écritures restent soumises à tenant_isolation.
CREATE POLICY own_memberships_read ON memberships
  FOR SELECT USING (user_id = app_current_user_id());

CREATE POLICY own_client_profiles_read ON client_profiles
  FOR SELECT USING (user_id = app_current_user_id());

-- ---------------------------------------------------------------------------
-- 3. Anti-double-booking
-- Prisma a créé "slot" comme simple colonne tstzrange : on la remplace par une colonne
-- générée, puis on interdit le chevauchement de deux occupations actives d'une même
-- personne ou ressource. Deux réservations simultanées : la seconde échoue (SQLSTATE 23P01).
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "btree_gist";

ALTER TABLE staff_busy_slots DROP COLUMN slot;
ALTER TABLE staff_busy_slots
  ADD COLUMN slot tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;
ALTER TABLE staff_busy_slots
  ADD CONSTRAINT staff_busy_slots_no_overlap
  EXCLUDE USING gist (tenant_id WITH =, staff_id WITH =, slot WITH &&) WHERE (is_active);
ALTER TABLE staff_busy_slots
  ADD CONSTRAINT staff_busy_slots_source_chk CHECK (num_nonnulls(item_id, hold_id) = 1),
  ADD CONSTRAINT staff_busy_slots_period_chk CHECK (ends_at > starts_at);

ALTER TABLE resource_busy_slots DROP COLUMN slot;
ALTER TABLE resource_busy_slots
  ADD COLUMN slot tstzrange GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;
ALTER TABLE resource_busy_slots
  ADD CONSTRAINT resource_busy_slots_no_overlap
  EXCLUDE USING gist (tenant_id WITH =, resource_id WITH =, slot WITH &&) WHERE (is_active);
ALTER TABLE resource_busy_slots
  ADD CONSTRAINT resource_busy_slots_source_chk CHECK (num_nonnulls(item_id, hold_id) = 1),
  ADD CONSTRAINT resource_busy_slots_period_chk CHECK (ends_at > starts_at);

-- ---------------------------------------------------------------------------
-- 4. Contraintes métier
-- ---------------------------------------------------------------------------
ALTER TABLE salon_opening_hours
  ADD CONSTRAINT salon_opening_hours_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
  ADD CONSTRAINT salon_opening_hours_time_chk
    CHECK (opens_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND closes_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND closes_at > opens_at);
ALTER TABLE staff_schedules
  ADD CONSTRAINT staff_schedules_weekday_chk CHECK (weekday BETWEEN 1 AND 7),
  ADD CONSTRAINT staff_schedules_time_chk
    CHECK (starts_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ends_at ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND ends_at > starts_at);
ALTER TABLE salon_closures        ADD CONSTRAINT salon_closures_period_chk     CHECK (ends_at > starts_at);
ALTER TABLE staff_time_off        ADD CONSTRAINT staff_time_off_period_chk     CHECK (ends_at > starts_at);
ALTER TABLE appointments          ADD CONSTRAINT appointments_period_chk       CHECK (ends_at > starts_at);
ALTER TABLE appointment_items     ADD CONSTRAINT appointment_items_period_chk  CHECK (ends_at > starts_at);
ALTER TABLE booking_holds         ADD CONSTRAINT booking_holds_period_chk      CHECK (ends_at > starts_at);

ALTER TABLE services
  ADD CONSTRAINT services_amounts_chk CHECK (base_price >= 0 AND duration_minutes > 0),
  ADD CONSTRAINT services_percent_chk CHECK ((deposit_percent IS NULL OR deposit_percent BETWEEN 0 AND 100) AND tax_rate_percent BETWEEN 0 AND 100);
ALTER TABLE service_variants      ADD CONSTRAINT service_variants_amounts_chk  CHECK (price >= 0 AND duration_minutes > 0);
ALTER TABLE service_steps         ADD CONSTRAINT service_steps_duration_chk    CHECK (duration_minutes > 0);
ALTER TABLE appointments
  ADD CONSTRAINT appointments_amounts_chk
    CHECK (estimated_total >= 0 AND deposit_required >= 0 AND deposit_paid >= 0);

ALTER TABLE sales
  ADD CONSTRAINT sales_amounts_chk
    CHECK (subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND total >= 0 AND tip_total >= 0 AND paid_total >= 0),
  ADD CONSTRAINT sales_void_chk CHECK (status <> 'VOIDED' OR (void_reason IS NOT NULL AND voided_by IS NOT NULL));
ALTER TABLE sale_items
  ADD CONSTRAINT sale_items_amounts_chk CHECK (quantity > 0 AND unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0),
  ADD CONSTRAINT sale_items_target_chk CHECK (
    (type = 'SERVICE' AND service_id IS NOT NULL) OR
    (type = 'PRODUCT' AND product_id IS NOT NULL) OR
    (type = 'PREPAID_PACKAGE' AND prepaid_package_id IS NOT NULL) OR
    (type = 'GIFT_CARD'));
ALTER TABLE tips                  ADD CONSTRAINT tips_amount_chk               CHECK (amount > 0);
ALTER TABLE payments
  ADD CONSTRAINT payments_amount_chk CHECK (amount > 0),
  ADD CONSTRAINT payments_target_chk CHECK (sale_id IS NOT NULL OR appointment_id IS NOT NULL),
  ADD CONSTRAINT payments_cash_session_chk CHECK (method <> 'CASH' OR cash_session_id IS NOT NULL),
  ADD CONSTRAINT payments_gift_card_chk CHECK (method <> 'GIFT_CARD' OR gift_card_id IS NOT NULL);
ALTER TABLE refunds
  ADD CONSTRAINT refunds_amount_chk CHECK (amount > 0),
  ADD CONSTRAINT refunds_cash_session_chk CHECK (method <> 'CASH' OR cash_session_id IS NOT NULL);
ALTER TABLE cash_sessions         ADD CONSTRAINT cash_sessions_float_chk       CHECK (opening_float >= 0);
ALTER TABLE cash_movements        ADD CONSTRAINT cash_movements_amount_chk     CHECK (amount > 0);
ALTER TABLE expenses
  ADD CONSTRAINT expenses_amount_chk CHECK (amount > 0),
  ADD CONSTRAINT expenses_cash_session_chk CHECK (payment_method <> 'CASH' OR cash_session_id IS NOT NULL);
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_side_chk
    CHECK (debit >= 0 AND credit >= 0 AND (debit = 0) <> (credit = 0));

-- Une seule session de caisse ouverte par caisse.
CREATE UNIQUE INDEX cash_sessions_one_open_per_register
  ON cash_sessions (tenant_id, register_id) WHERE status = 'OPEN';

ALTER TABLE products              ADD CONSTRAINT products_prices_chk           CHECK (purchase_price >= 0 AND (sale_price IS NULL OR sale_price >= 0));
ALTER TABLE stock_movements       ADD CONSTRAINT stock_movements_quantity_chk  CHECK (quantity <> 0);
ALTER TABLE stock_transfers       ADD CONSTRAINT stock_transfers_salons_chk    CHECK (from_salon_id <> to_salon_id);
ALTER TABLE stock_transfer_lines  ADD CONSTRAINT stock_transfer_lines_qty_chk  CHECK (quantity > 0);
ALTER TABLE purchase_order_lines
  ADD CONSTRAINT purchase_order_lines_qty_chk CHECK (quantity_ordered > 0 AND quantity_received >= 0 AND unit_cost >= 0);

ALTER TABLE commission_rules
  ADD CONSTRAINT commission_rules_value_chk CHECK (value >= 0 AND (type <> 'PERCENT' OR value <= 100)),
  ADD CONSTRAINT commission_rules_applies_chk CHECK (applies_to IN ('SERVICE', 'PRODUCT'));

ALTER TABLE gift_cards            ADD CONSTRAINT gift_cards_balance_chk        CHECK (balance >= 0 AND balance <= initial_amount);
ALTER TABLE client_packages       ADD CONSTRAINT client_packages_sessions_chk  CHECK (sessions_used >= 0 AND sessions_used <= sessions_total);
ALTER TABLE prepaid_packages      ADD CONSTRAINT prepaid_packages_sessions_chk CHECK (sessions > 0 AND price >= 0);
ALTER TABLE promotions
  ADD CONSTRAINT promotions_value_chk CHECK (value > 0 AND (type <> 'PERCENT' OR value <= 100));
ALTER TABLE reviews               ADD CONSTRAINT reviews_rating_chk            CHECK (rating BETWEEN 1 AND 5);
ALTER TABLE client_profiles       ADD CONSTRAINT client_profiles_credit_chk    CHECK (credit_balance >= 0);

-- ---------------------------------------------------------------------------
-- 5. Tables en ajout seul : toute modification ou suppression est refusée.
-- (Pour la purge légale d'un tenant, le propriétaire des tables désactive le trigger
--  dans une procédure dédiée et journalisée.)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_forbid_mutation() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'La table % est en ajout seul (% interdit)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END $$;

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER client_consents_append_only
  BEFORE UPDATE OR DELETE ON client_consents
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();
CREATE TRIGGER appointment_status_history_append_only
  BEFORE UPDATE OR DELETE ON appointment_status_history
  FOR EACH ROW EXECUTE FUNCTION app_forbid_mutation();

-- ---------------------------------------------------------------------------
-- 6. Registre équilibré : vérifié à la validation (COMMIT) de la transaction, pour que
--    toutes les lignes d'une même opération puissent être insérées avant le contrôle.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_check_ledger_balance() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  diff numeric;
BEGIN
  SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) INTO diff
  FROM ledger_entries
  WHERE tenant_id = NEW.tenant_id AND transaction_group = NEW.transaction_group;
  IF diff <> 0 THEN
    RAISE EXCEPTION 'Écriture déséquilibrée (groupe %, écart %)', NEW.transaction_group, diff
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER ledger_entries_balanced
  AFTER INSERT ON ledger_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_check_ledger_balance();
