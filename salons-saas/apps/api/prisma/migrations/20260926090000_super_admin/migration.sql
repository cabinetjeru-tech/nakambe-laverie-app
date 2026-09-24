-- CreateEnum
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportTicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "SupportTicketPriority" NOT NULL DEFAULT 'NORMAL',
    "created_by_user_id" UUID NOT NULL,
    "assigned_to_id" UUID,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "from_platform" BOOLEAN NOT NULL DEFAULT false,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_tickets_status_last_message_at_idx" ON "support_tickets"("status", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenant_id_id_key" ON "support_tickets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "support_tickets_tenant_id_number_key" ON "support_tickets"("tenant_id", "number");

-- CreateIndex
CREATE INDEX "support_messages_tenant_id_ticket_id_created_at_idx" ON "support_messages"("tenant_id", "ticket_id", "created_at");

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "support_tickets"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- Garanties complémentaires (non exprimables dans Prisma)
-- ============================================================================

-- Tickets de support : isolation par tenant, comme toutes les tables tenant.
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_tickets
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- Messages : en plus de l'isolation, les notes internes de l'équipe plateforme sont
-- invisibles (et impossibles à écrire) pour l'API des salons. Seule la connexion
-- salons_platform (BYPASSRLS) les voit.
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON support_messages
  USING (tenant_id = app_current_tenant_id() AND NOT internal)
  WITH CHECK (tenant_id = app_current_tenant_id() AND NOT internal AND NOT from_platform);

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_category_chk CHECK (category IN ('billing', 'bug', 'question', 'account', 'other'));
ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_body_chk CHECK (length(body) BETWEEN 1 AND 5000);

-- Paramètres, numérotation et paiements de la plateforme : l'API des salons lit, seule la
-- connexion salons_platform écrit. (Même règle dans roles.sql pour une installation neuve.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'salons_app') THEN
    REVOKE INSERT, UPDATE, DELETE ON platform_settings FROM salons_app;
    REVOKE ALL ON platform_sequences FROM salons_app;
    REVOKE INSERT, UPDATE, DELETE ON saas_invoices, saas_payments FROM salons_app;
    REVOKE UPDATE, DELETE ON saas_subscriptions FROM salons_app;
  END IF;
END $$;
