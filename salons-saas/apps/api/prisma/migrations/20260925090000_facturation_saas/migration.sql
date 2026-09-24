-- CreateEnum
CREATE TYPE "SaasInvoiceKind" AS ENUM ('RENEWAL', 'UPGRADE');

-- DropIndex
DROP INDEX "saas_subscriptions_tenant_id_status_idx";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "action_url" TEXT,
ADD COLUMN     "dedupe_key" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "saas_invoices" ADD COLUMN     "buyer_snapshot" JSONB NOT NULL,
ADD COLUMN     "cycle" "BillingCycle" NOT NULL,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "kind" "SaasInvoiceKind" NOT NULL DEFAULT 'RENEWAL',
ADD COLUMN     "plan_id" UUID NOT NULL,
ADD COLUMN     "void_reason" TEXT,
ADD COLUMN     "voided_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "saas_payments" ADD COLUMN     "checkout_url" TEXT,
ADD COLUMN     "created_by" UUID,
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "operator" TEXT,
ADD COLUMN     "payer_phone" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "provider_token" TEXT,
ADD COLUMN     "tenant_id" UUID NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMPTZ(3) NOT NULL,
ADD COLUMN     "validated_by" UUID;

-- AlterTable
ALTER TABLE "saas_subscriptions" ADD COLUMN     "past_due_since" TIMESTAMPTZ(3),
ADD COLUMN     "pending_cycle" "BillingCycle",
ADD COLUMN     "pending_plan_id" UUID;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "grace_ends_at" TIMESTAMPTZ(3),
ADD COLUMN     "suspended_at" TIMESTAMPTZ(3),
ADD COLUMN     "suspension_reason" TEXT;

-- CreateTable
CREATE TABLE "platform_sequences" (
    "doc_type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "platform_sequences_pkey" PRIMARY KEY ("doc_type","year")
);

-- CreateIndex
CREATE INDEX "notifications_tenant_id_recipient_user_id_created_at_idx" ON "notifications"("tenant_id", "recipient_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_dedupe_key_key" ON "notifications"("tenant_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "saas_invoices_status_due_at_idx" ON "saas_invoices"("status", "due_at");

-- CreateIndex
CREATE UNIQUE INDEX "saas_payments_provider_token_key" ON "saas_payments"("provider_token");

-- CreateIndex
CREATE INDEX "saas_payments_status_method_idx" ON "saas_payments"("status", "method");

-- CreateIndex
CREATE INDEX "saas_payments_tenant_id_idx" ON "saas_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "saas_subscriptions_status_current_period_end_idx" ON "saas_subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "saas_subscriptions_tenant_id_key" ON "saas_subscriptions"("tenant_id");

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_pending_plan_id_fkey" FOREIGN KEY ("pending_plan_id") REFERENCES "plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_payments" ADD CONSTRAINT "saas_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================================
-- Garanties complémentaires (non exprimables dans Prisma)
-- ============================================================================

-- saas_payments porte désormais tenant_id : même isolation que les autres tables tenant.
-- (L'API lit ses paiements via salons_app ; le moteur de facturation via salons_platform.)
ALTER TABLE saas_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON saas_payments
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- Une seule facture de renouvellement (non annulée) par période : le planificateur peut
-- tourner plusieurs fois, ou sur plusieurs serveurs, sans jamais facturer deux fois.
CREATE UNIQUE INDEX saas_invoices_one_renewal_per_period
  ON saas_invoices (subscription_id, period_start)
  WHERE kind = 'RENEWAL' AND status <> 'VOID';

ALTER TABLE saas_invoices
  ADD CONSTRAINT saas_invoices_amounts_chk CHECK (subtotal >= 0 AND tax_amount >= 0 AND total = subtotal + tax_amount),
  ADD CONSTRAINT saas_invoices_period_chk CHECK (period_end > period_start);
ALTER TABLE saas_payments
  ADD CONSTRAINT saas_payments_amount_chk CHECK (amount > 0);
