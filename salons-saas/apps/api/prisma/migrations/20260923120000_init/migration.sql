-- Extensions requises (index trigramme pour la recherche de clients par nom).
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('LOGIN', 'PHONE_VERIFICATION', 'EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('PLATFORM_OWNER', 'PLATFORM_SUPPORT', 'PLATFORM_BILLING');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "SaasSubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SaasInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "SalonStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ResourceType" AS ENUM ('CHAIR', 'WASH_STATION', 'DRYER', 'ROOM', 'OTHER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "StaffContractType" AS ENUM ('EMPLOYEE', 'FREELANCE', 'CHAIR_RENTAL', 'APPRENTICE');

-- CreateEnum
CREATE TYPE "TimeOffType" AS ENUM ('LEAVE', 'SICK', 'BREAK', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('MARKETING_SMS', 'MARKETING_WHATSAPP', 'MARKETING_EMAIL', 'PHOTOS', 'PHOTOS_PUBLIC', 'TECHNICAL_DATA');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED_BY_CLIENT', 'CANCELLED_BY_SALON', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('ONLINE', 'COUNTER', 'PHONE', 'WHATSAPP', 'WALK_IN');

-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'CALLED', 'IN_SERVICE', 'DONE', 'LEFT');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('OPEN', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "SaleItemType" AS ENUM ('SERVICE', 'PRODUCT', 'GIFT_CARD', 'PREPAID_PACKAGE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY_MANUAL', 'CINETPAY', 'LIGDICASH', 'CARD', 'BANK_TRANSFER', 'GIFT_CARD', 'CLIENT_CREDIT', 'LOYALTY_POINTS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'PROVIDER', 'CLIENT_CREDIT');

-- CreateEnum
CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashMovementType" AS ENUM ('CASH_IN', 'CASH_OUT', 'BANK_DEPOSIT');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED', 'PAID', 'CREDITED');

-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('CASH', 'MOBILE_MONEY', 'PROVIDER_CLEARING', 'BANK', 'REVENUE_SERVICES', 'REVENUE_PRODUCTS', 'DISCOUNTS', 'TAX_COLLECTED', 'TIPS_PAYABLE', 'DEPOSITS_HELD', 'GIFT_CARD_LIABILITY', 'PACKAGE_LIABILITY', 'CLIENT_CREDIT', 'EXPENSES', 'CASH_DIFFERENCE');

-- CreateEnum
CREATE TYPE "ExpensePaymentMethod" AS ENUM ('CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('RETAIL', 'PROFESSIONAL', 'BOTH');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE_RECEIPT', 'SALE', 'CONSUMPTION', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT', 'LOSS', 'RETURN');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('DRAFT', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PAID');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'ADJUST', 'EXPIRE');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClientPackageStatus" AS ENUM ('ACTIVE', 'EXHAUSTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PromotionType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'SMS', 'WHATSAPP', 'EMAIL', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ComplaintStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "phone_verified_at" TIMESTAMPTZ(3),
    "email" TEXT,
    "email_verified_at" TIMESTAMPTZ(3),
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT,
    "mfa_secret_enc" TEXT,
    "mfa_enabled_at" TIMESTAMPTZ(3),
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "anonymized_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "active_tenant_id" UUID,
    "device_label" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "rotated_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_codes" (
    "id" UUID NOT NULL,
    "target" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_staff" (
    "user_id" UUID NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_staff_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "code" TEXT NOT NULL,
    "group_name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "feature_code" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "price_monthly" BIGINT NOT NULL,
    "price_yearly" BIGINT NOT NULL,
    "max_salons" INTEGER,
    "max_staff" INTEGER,
    "sms_quota_monthly" INTEGER NOT NULL DEFAULT 0,
    "storage_quota_mb" INTEGER NOT NULL DEFAULT 500,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_features" (
    "plan_id" UUID NOT NULL,
    "feature_code" TEXT NOT NULL,

    CONSTRAINT "plan_features_pkey" PRIMARY KEY ("plan_id","feature_code")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL DEFAULT 'BF',
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Ouagadougou',
    "tax_id" TEXT,
    "trade_register" TEXT,
    "logo_key" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "plan_id" UUID NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(3),
    "shard" TEXT NOT NULL DEFAULT 'main',
    "data_key_enc" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_domains" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "hostname" TEXT NOT NULL,
    "salon_id" UUID,
    "verification_token" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "cycle" "BillingCycle" NOT NULL,
    "status" "SaasSubscriptionStatus" NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "current_period_start" TIMESTAMPTZ(3) NOT NULL,
    "current_period_end" TIMESTAMPTZ(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "saas_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID,
    "number" TEXT NOT NULL,
    "status" "SaasInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "period_start" TIMESTAMPTZ(3) NOT NULL,
    "period_end" TIMESTAMPTZ(3) NOT NULL,
    "subtotal" BIGINT NOT NULL,
    "tax_amount" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "paid_at" TIMESTAMPTZ(3),
    "pdf_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider_reference" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "raw_payload" JSONB,
    "paid_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "tenant_id" UUID NOT NULL,
    "metric" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "value" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("tenant_id","metric","period_start")
);

-- CreateTable
CREATE TABLE "feature_overrides" (
    "tenant_id" UUID NOT NULL,
    "feature_code" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_by" UUID,

    CONSTRAINT "feature_overrides_pkey" PRIMARY KEY ("tenant_id","feature_code")
);

-- CreateTable
CREATE TABLE "impersonation_grants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "support_user_id" UUID,
    "reason" TEXT NOT NULL,
    "read_only" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "impersonation_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_settings" (
    "tenant_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("tenant_id","key")
);

-- CreateTable
CREATE TABLE "salons" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "address_line" TEXT,
    "landmark" TEXT,
    "city" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL DEFAULT 'BF',
    "gps_lat" DOUBLE PRECISION,
    "gps_lng" DOUBLE PRECISION,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Ouagadougou',
    "currency" CHAR(3) NOT NULL DEFAULT 'XOF',
    "status" "SalonStatus" NOT NULL DEFAULT 'ACTIVE',
    "online_booking_enabled" BOOLEAN NOT NULL DEFAULT true,
    "booking_min_notice_minutes" INTEGER NOT NULL DEFAULT 60,
    "booking_max_advance_days" INTEGER NOT NULL DEFAULT 60,
    "cancellation_notice_hours" INTEGER NOT NULL DEFAULT 12,
    "slot_interval_minutes" INTEGER NOT NULL DEFAULT 15,
    "default_deposit_percent" INTEGER NOT NULL DEFAULT 0,
    "invoice_prefix" TEXT NOT NULL DEFAULT 'F',
    "receipt_footer" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "salons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_opening_hours" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "opens_at" TEXT NOT NULL,
    "closes_at" TEXT NOT NULL,

    CONSTRAINT "salon_opening_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salon_closures" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,

    CONSTRAINT "salon_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "type" "ResourceType" NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "tenant_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_code" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("tenant_id","role_id","permission_code")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "all_salons" BOOLEAN NOT NULL DEFAULT false,
    "permissions_version" INTEGER NOT NULL DEFAULT 1,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_roles" (
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,

    CONSTRAINT "membership_roles_pkey" PRIMARY KEY ("tenant_id","membership_id","role_id")
);

-- CreateTable
CREATE TABLE "membership_salons" (
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,

    CONSTRAINT "membership_salons_pkey" PRIMARY KEY ("tenant_id","membership_id","salon_id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "role_id" UUID NOT NULL,
    "salon_ids" UUID[],
    "token_hash" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_members" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID,
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "photo_key" TEXT,
    "bio" TEXT,
    "calendar_color" TEXT NOT NULL DEFAULT '#2F80ED',
    "contract_type" "StaffContractType" NOT NULL DEFAULT 'EMPLOYEE',
    "base_salary" BIGINT,
    "bookable_online" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "hired_at" DATE,
    "left_at" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_salons" (
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,

    CONSTRAINT "staff_salons_pkey" PRIMARY KEY ("tenant_id","staff_id","salon_id")
);

-- CreateTable
CREATE TABLE "staff_skills" (
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "price_override" BIGINT,
    "duration_factor" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "staff_skills_pkey" PRIMARY KEY ("tenant_id","staff_id","service_id")
);

-- CreateTable
CREATE TABLE "staff_schedules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "starts_at" TEXT NOT NULL,
    "ends_at" TEXT NOT NULL,
    "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" DATE,

    CONSTRAINT "staff_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_time_off" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "type" "TimeOffType" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_time_off_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "time_clock_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "clock_in_at" TIMESTAMPTZ(3) NOT NULL,
    "clock_out_at" TIMESTAMPTZ(3),
    "source" TEXT NOT NULL DEFAULT 'app',
    "note" TEXT,

    CONSTRAINT "time_clock_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "base_price" BIGINT NOT NULL,
    "price_is_from" BOOLEAN NOT NULL DEFAULT false,
    "duration_minutes" INTEGER NOT NULL,
    "bookable_online" BOOLEAN NOT NULL DEFAULT true,
    "deposit_percent" INTEGER,
    "tax_rate_percent" INTEGER NOT NULL DEFAULT 0,
    "image_key" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_variants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_steps" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "blocks_staff" BOOLEAN NOT NULL DEFAULT true,
    "resource_type" "ResourceType",

    CONSTRAINT "service_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_salon_prices" (
    "tenant_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "price" BIGINT NOT NULL,
    "is_offered" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "service_salon_prices_pkey" PRIMARY KEY ("tenant_id","service_id","salon_id")
);

-- CreateTable
CREATE TABLE "service_packages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_package_items" (
    "tenant_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "service_package_items_pkey" PRIMARY KEY ("tenant_id","package_id","service_id")
);

-- CreateTable
CREATE TABLE "client_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "client_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "whatsapp" TEXT,
    "email" TEXT,
    "birth_date" DATE,
    "gender" "Gender",
    "hair_type" TEXT,
    "preferred_salon_id" UUID,
    "preferred_staff_id" UUID,
    "tags" TEXT[],
    "source" TEXT,
    "referred_by_id" UUID,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "last_visit_at" TIMESTAMPTZ(3),
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "total_spent" BIGINT NOT NULL DEFAULT 0,
    "no_show_count" INTEGER NOT NULL DEFAULT 0,
    "credit_balance" BIGINT NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "anonymized_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_consents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "type" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "source" TEXT NOT NULL,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_technical_notes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "content_enc" TEXT NOT NULL,
    "appointment_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "client_technical_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "appointment_id" UUID,
    "storage_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "caption" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_notes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "client_id" UUID,
    "reference" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "channel" "BookingChannel" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "estimated_total" BIGINT NOT NULL,
    "deposit_required" BIGINT NOT NULL DEFAULT 0,
    "deposit_paid" BIGINT NOT NULL DEFAULT 0,
    "client_note" TEXT,
    "internal_note" TEXT,
    "manage_token_hash" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "checked_in_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "variant_id" UUID,
    "staff_id" UUID NOT NULL,
    "resource_id" UUID,
    "staff_requested" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,
    "service_name" TEXT NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,

    CONSTRAINT "appointment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_busy_slots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "item_id" UUID,
    "hold_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "slot" tstzrange,

    CONSTRAINT "staff_busy_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_busy_slots" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "resource_id" UUID NOT NULL,
    "item_id" UUID,
    "hold_id" UUID,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "slot" tstzrange,

    CONSTRAINT "resource_busy_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_holds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "client_id" UUID,
    "service_id" UUID NOT NULL,
    "variant_id" UUID,
    "staff_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "released_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_status_history" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "from_status" "AppointmentStatus",
    "to_status" "AppointmentStatus" NOT NULL,
    "reason" TEXT,
    "changed_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "client_id" UUID,
    "display_name" TEXT NOT NULL,
    "phone" TEXT,
    "service_id" UUID,
    "preferred_staff_id" UUID,
    "assigned_staff_id" UUID,
    "appointment_id" UUID,
    "ticket_number" INTEGER NOT NULL,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "arrived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "called_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "client_id" UUID,
    "appointment_id" UUID,
    "cash_session_id" UUID,
    "status" "SaleStatus" NOT NULL DEFAULT 'OPEN',
    "subtotal" BIGINT NOT NULL DEFAULT 0,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL DEFAULT 0,
    "tip_total" BIGINT NOT NULL DEFAULT 0,
    "paid_total" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "promotion_id" UUID,
    "offline_id" TEXT,
    "note" TEXT,
    "void_reason" TEXT,
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(3),
    "closed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "type" "SaleItemType" NOT NULL,
    "service_id" UUID,
    "variant_id" UUID,
    "product_id" UUID,
    "appointment_item_id" UUID,
    "prepaid_package_id" UUID,
    "staff_id" UUID,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit_price" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate_percent" INTEGER NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL,
    "unit_cost" BIGINT,
    "paid_with_package" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "amount" BIGINT NOT NULL,

    CONSTRAINT "tips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID,
    "appointment_id" UUID,
    "cash_session_id" UUID,
    "gift_card_id" UUID,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "is_deposit" BOOLEAN NOT NULL DEFAULT false,
    "operator" TEXT,
    "payer_phone" TEXT,
    "provider_reference" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "validated_by" UUID,
    "validated_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "failure_reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_token" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "signature_valid" BOOLEAN,
    "raw_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "cash_session_id" UUID,
    "method" "RefundMethod" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_items" (
    "tenant_id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" BIGINT NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "refund_items_pkey" PRIMARY KEY ("tenant_id","refund_id","sale_item_id")
);

-- CreateTable
CREATE TABLE "cash_registers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "register_id" UUID NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opening_float" BIGINT NOT NULL,
    "expected_cash" BIGINT,
    "counted_cash" BIGINT,
    "difference" BIGINT,
    "difference_reason" TEXT,
    "opened_by" UUID NOT NULL,
    "opened_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by" UUID,
    "closed_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cash_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cash_session_id" UUID NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "type" "InvoiceType" NOT NULL DEFAULT 'INVOICE',
    "number" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
    "sale_id" UUID,
    "client_id" UUID,
    "credited_invoice_id" UUID,
    "seller_snapshot" JSONB NOT NULL,
    "buyer_snapshot" JSONB,
    "subtotal" BIGINT NOT NULL,
    "discount_total" BIGINT NOT NULL DEFAULT 0,
    "tax_total" BIGINT NOT NULL DEFAULT 0,
    "total" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "issued_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pdf_key" TEXT,
    "issued_by" UUID,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" BIGINT NOT NULL,
    "discount_amount" BIGINT NOT NULL DEFAULT 0,
    "tax_rate_percent" INTEGER NOT NULL DEFAULT 0,
    "line_total" BIGINT NOT NULL,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "tenant_id" UUID NOT NULL,
    "doc_type" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("tenant_id","doc_type","year")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "transaction_group" UUID NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "debit" BIGINT NOT NULL DEFAULT 0,
    "credit" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "sale_id" UUID,
    "payment_id" UUID,
    "refund_id" UUID,
    "cash_session_id" UUID,
    "cash_movement_id" UUID,
    "expense_id" UUID,
    "description" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "supplier_id" UUID,
    "purchase_order_id" UUID,
    "cash_session_id" UUID,
    "payroll_period_id" UUID,
    "label" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "payment_method" "ExpensePaymentMethod" NOT NULL,
    "reference" TEXT,
    "receipt_key" TEXT,
    "spent_at" DATE NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "supplier_id" UUID,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "sku" TEXT,
    "barcode" TEXT,
    "kind" "ProductKind" NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pièce',
    "purchase_price" BIGINT NOT NULL,
    "sale_price" BIGINT,
    "tax_rate_percent" INTEGER NOT NULL DEFAULT 0,
    "image_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_stocks" (
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "alert_threshold" DECIMAL(12,3),
    "average_cost" BIGINT NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_stocks_pkey" PRIMARY KEY ("tenant_id","product_id","salon_id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unit_cost" BIGINT,
    "sale_id" UUID,
    "purchase_order_line_id" UUID,
    "transfer_id" UUID,
    "reason" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_consumptions" (
    "tenant_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "service_consumptions_pkey" PRIMARY KEY ("tenant_id","service_id","product_id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "total" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "ordered_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity_ordered" DECIMAL(12,3) NOT NULL,
    "quantity_received" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unit_cost" BIGINT NOT NULL,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "from_salon_id" UUID NOT NULL,
    "to_salon_id" UUID NOT NULL,
    "status" "StockTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "sent_at" TIMESTAMPTZ(3),
    "received_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "tenant_id" UUID NOT NULL,
    "transfer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("tenant_id","transfer_id","product_id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID,
    "role_id" UUID,
    "service_category_id" UUID,
    "service_id" UUID,
    "product_id" UUID,
    "applies_to" "SaleItemType" NOT NULL,
    "type" "CommissionType" NOT NULL,
    "value" INTEGER NOT NULL,
    "min_monthly_revenue" BIGINT,
    "valid_from" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "sale_item_id" UUID NOT NULL,
    "rule_id" UUID,
    "base_amount" BIGINT NOT NULL,
    "amount" BIGINT NOT NULL,
    "payroll_period_id" UUID,
    "earned_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "commission_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "validated_by" UUID,
    "validated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payroll_period_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "base_salary" BIGINT NOT NULL DEFAULT 0,
    "commissions_total" BIGINT NOT NULL DEFAULT 0,
    "tips_total" BIGINT NOT NULL DEFAULT 0,
    "advances_total" BIGINT NOT NULL DEFAULT 0,
    "other_adjustments" BIGINT NOT NULL DEFAULT 0,
    "net_amount" BIGINT NOT NULL,
    "paid_at" TIMESTAMPTZ(3),

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_advances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "payroll_period_id" UUID,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "given_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by" UUID NOT NULL,

    CONSTRAINT "staff_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "tenant_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "points_per_unit" INTEGER NOT NULL DEFAULT 1,
    "unit_amount" BIGINT NOT NULL DEFAULT 1000,
    "point_value" BIGINT NOT NULL DEFAULT 10,
    "min_points_to_redeem" INTEGER NOT NULL DEFAULT 100,
    "points_expire_days" INTEGER,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "sale_id" UUID,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(3),
    "note" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_cards" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "code_last4" TEXT NOT NULL,
    "initial_amount" BIGINT NOT NULL,
    "balance" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "buyer_client_id" UUID,
    "owner_client_id" UUID,
    "recipient_name" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_card_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "gift_card_id" UUID NOT NULL,
    "sale_id" UUID,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_card_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prepaid_packages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "validity_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prepaid_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_packages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "prepaid_package_id" UUID NOT NULL,
    "sessions_total" INTEGER NOT NULL,
    "sessions_used" INTEGER NOT NULL DEFAULT 0,
    "price_paid" BIGINT NOT NULL,
    "status" "ClientPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "purchased_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3),

    CONSTRAINT "client_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_package_usages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_package_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 1,
    "used_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_package_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" "PromotionType" NOT NULL,
    "value" BIGINT NOT NULL,
    "min_purchase" BIGINT,
    "service_ids" UUID[],
    "salon_ids" UUID[],
    "max_uses" INTEGER,
    "max_uses_per_client" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_redemptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "promotion_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "client_id" UUID,
    "amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "client_id" UUID,
    "recipient_user_id" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "event" TEXT NOT NULL,
    "destination" TEXT,
    "body" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "campaign_id" UUID,
    "related_entity" TEXT,
    "provider_message_id" TEXT,
    "cost_units" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "scheduled_for" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "body" TEXT NOT NULL,
    "segment" JSONB NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMPTZ(3),
    "sent_at" TIMESTAMPTZ(3),
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_recipients" (
    "tenant_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',

    CONSTRAINT "campaign_recipients_pkey" PRIMARY KEY ("tenant_id","campaign_id","client_id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "client_id" UUID,
    "appointment_id" UUID,
    "staff_id" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reply" TEXT,
    "replied_by" UUID,
    "replied_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "complaints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salon_id" UUID NOT NULL,
    "client_id" UUID,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ComplaintStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "handled_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(3),

    CONSTRAINT "complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_endpoints" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret_enc" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_endpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "permissions" TEXT[],
    "last_used_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID,
    "actor_user_id" UUID,
    "impersonated_by" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "salon_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_refresh_token_hash_key" ON "user_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_family_id_idx" ON "user_sessions"("family_id");

-- CreateIndex
CREATE INDEX "verification_codes_target_purpose_idx" ON "verification_codes"("target", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_domains_hostname_key" ON "tenant_domains"("hostname");

-- CreateIndex
CREATE INDEX "tenant_domains_tenant_id_idx" ON "tenant_domains"("tenant_id");

-- CreateIndex
CREATE INDEX "saas_subscriptions_tenant_id_status_idx" ON "saas_subscriptions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "saas_invoices_number_key" ON "saas_invoices"("number");

-- CreateIndex
CREATE INDEX "saas_invoices_tenant_id_status_idx" ON "saas_invoices"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "saas_payments_idempotency_key_key" ON "saas_payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "saas_payments_method_provider_reference_key" ON "saas_payments"("method", "provider_reference");

-- CreateIndex
CREATE INDEX "impersonation_grants_tenant_id_expires_at_idx" ON "impersonation_grants"("tenant_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "salons_tenant_id_id_key" ON "salons"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "salons_tenant_id_slug_key" ON "salons"("tenant_id", "slug");

-- CreateIndex
CREATE INDEX "salon_opening_hours_tenant_id_salon_id_weekday_idx" ON "salon_opening_hours"("tenant_id", "salon_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "salon_opening_hours_tenant_id_id_key" ON "salon_opening_hours"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "salon_closures_tenant_id_salon_id_starts_at_idx" ON "salon_closures"("tenant_id", "salon_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "salon_closures_tenant_id_id_key" ON "salon_closures"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "resources_tenant_id_salon_id_type_idx" ON "resources"("tenant_id", "salon_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "resources_tenant_id_id_key" ON "resources"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_id_key" ON "roles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenant_id_code_key" ON "roles"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_id_key" ON "memberships"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_key" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_phone_idx" ON "invitations"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tenant_id_id_key" ON "invitations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_tenant_id_id_key" ON "staff_members"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_members_tenant_id_membership_id_key" ON "staff_members"("tenant_id", "membership_id");

-- CreateIndex
CREATE INDEX "staff_skills_tenant_id_service_id_idx" ON "staff_skills"("tenant_id", "service_id");

-- CreateIndex
CREATE INDEX "staff_schedules_tenant_id_staff_id_weekday_idx" ON "staff_schedules"("tenant_id", "staff_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "staff_schedules_tenant_id_id_key" ON "staff_schedules"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "staff_time_off_tenant_id_staff_id_starts_at_idx" ON "staff_time_off"("tenant_id", "staff_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_time_off_tenant_id_id_key" ON "staff_time_off"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "time_clock_entries_tenant_id_staff_id_clock_in_at_idx" ON "time_clock_entries"("tenant_id", "staff_id", "clock_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "time_clock_entries_tenant_id_id_key" ON "time_clock_entries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_categories_tenant_id_id_key" ON "service_categories"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "services_tenant_id_category_id_idx" ON "services"("tenant_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_tenant_id_id_key" ON "services"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_variants_tenant_id_id_key" ON "service_variants"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_steps_tenant_id_id_key" ON "service_steps"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_steps_tenant_id_service_id_position_key" ON "service_steps"("tenant_id", "service_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "service_packages_tenant_id_id_key" ON "service_packages"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "client_profiles_user_id_idx" ON "client_profiles"("user_id");

-- CreateIndex
CREATE INDEX "client_profiles_full_name_trgm_idx" ON "client_profiles" USING GIN ("full_name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_tenant_id_id_key" ON "client_profiles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_tenant_id_client_number_key" ON "client_profiles"("tenant_id", "client_number");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_tenant_id_phone_key" ON "client_profiles"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "client_profiles_tenant_id_user_id_key" ON "client_profiles"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "client_consents_tenant_id_client_id_type_created_at_idx" ON "client_consents"("tenant_id", "client_id", "type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_consents_tenant_id_id_key" ON "client_consents"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "client_technical_notes_tenant_id_client_id_idx" ON "client_technical_notes"("tenant_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_technical_notes_tenant_id_id_key" ON "client_technical_notes"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "client_photos_tenant_id_client_id_idx" ON "client_photos"("tenant_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_photos_tenant_id_id_key" ON "client_photos"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "client_notes_tenant_id_client_id_idx" ON "client_notes"("tenant_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_notes_tenant_id_id_key" ON "client_notes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_manage_token_hash_key" ON "appointments"("manage_token_hash");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_salon_id_starts_at_idx" ON "appointments"("tenant_id", "salon_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_client_id_starts_at_idx" ON "appointments"("tenant_id", "client_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_tenant_id_status_idx" ON "appointments"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_tenant_id_id_key" ON "appointments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_tenant_id_reference_key" ON "appointments"("tenant_id", "reference");

-- CreateIndex
CREATE INDEX "appointment_items_tenant_id_appointment_id_idx" ON "appointment_items"("tenant_id", "appointment_id");

-- CreateIndex
CREATE INDEX "appointment_items_tenant_id_staff_id_starts_at_idx" ON "appointment_items"("tenant_id", "staff_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_items_tenant_id_id_key" ON "appointment_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "staff_busy_slots_tenant_id_staff_id_starts_at_idx" ON "staff_busy_slots"("tenant_id", "staff_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "staff_busy_slots_tenant_id_id_key" ON "staff_busy_slots"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "resource_busy_slots_tenant_id_resource_id_starts_at_idx" ON "resource_busy_slots"("tenant_id", "resource_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "resource_busy_slots_tenant_id_id_key" ON "resource_busy_slots"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "booking_holds_expires_at_idx" ON "booking_holds"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "booking_holds_tenant_id_id_key" ON "booking_holds"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "appointment_status_history_tenant_id_appointment_id_idx" ON "appointment_status_history"("tenant_id", "appointment_id");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_status_history_tenant_id_id_key" ON "appointment_status_history"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "waitlist_entries_tenant_id_salon_id_status_arrived_at_idx" ON "waitlist_entries"("tenant_id", "salon_id", "status", "arrived_at");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_tenant_id_id_key" ON "waitlist_entries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_entries_tenant_id_appointment_id_key" ON "waitlist_entries"("tenant_id", "appointment_id");

-- CreateIndex
CREATE INDEX "sales_tenant_id_salon_id_created_at_idx" ON "sales"("tenant_id", "salon_id", "created_at");

-- CreateIndex
CREATE INDEX "sales_tenant_id_client_id_idx" ON "sales"("tenant_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_id_key" ON "sales"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_number_key" ON "sales"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "sales_tenant_id_offline_id_key" ON "sales"("tenant_id", "offline_id");

-- CreateIndex
CREATE INDEX "sale_items_tenant_id_sale_id_idx" ON "sale_items"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "sale_items_tenant_id_staff_id_idx" ON "sale_items"("tenant_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "sale_items_tenant_id_id_key" ON "sale_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "tips_tenant_id_staff_id_idx" ON "tips"("tenant_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "tips_tenant_id_id_key" ON "tips"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_sale_id_idx" ON "payments"("tenant_id", "sale_id");

-- CreateIndex
CREATE INDEX "payments_tenant_id_status_method_idx" ON "payments"("tenant_id", "status", "method");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_id_key" ON "payments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_idempotency_key_key" ON "payments"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tenant_id_method_provider_reference_key" ON "payments"("tenant_id", "method", "provider_reference");

-- CreateIndex
CREATE INDEX "payment_transactions_provider_provider_token_idx" ON "payment_transactions"("provider", "provider_token");

-- CreateIndex
CREATE UNIQUE INDEX "payment_transactions_tenant_id_id_key" ON "payment_transactions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "refunds_tenant_id_payment_id_idx" ON "refunds"("tenant_id", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_tenant_id_id_key" ON "refunds"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_registers_tenant_id_id_key" ON "cash_registers"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "cash_sessions_tenant_id_register_id_status_idx" ON "cash_sessions"("tenant_id", "register_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cash_sessions_tenant_id_id_key" ON "cash_sessions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_tenant_id_id_key" ON "cash_movements"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_issued_at_idx" ON "invoices"("tenant_id", "issued_at");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_id_key" ON "invoices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_tenant_id_type_number_key" ON "invoices"("tenant_id", "type", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_tenant_id_id_key" ON "invoice_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_tenant_id_invoice_id_position_key" ON "invoice_lines"("tenant_id", "invoice_id", "position");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_transaction_group_idx" ON "ledger_entries"("tenant_id", "transaction_group");

-- CreateIndex
CREATE INDEX "ledger_entries_tenant_id_salon_id_account_occurred_at_idx" ON "ledger_entries"("tenant_id", "salon_id", "account", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_tenant_id_id_key" ON "ledger_entries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenant_id_id_key" ON "expense_categories"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_tenant_id_name_key" ON "expense_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_salon_id_spent_at_idx" ON "expenses"("tenant_id", "salon_id", "spent_at");

-- CreateIndex
CREATE UNIQUE INDEX "expenses_tenant_id_id_key" ON "expenses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_tenant_id_id_key" ON "suppliers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_id_key" ON "products"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_barcode_key" ON "products"("tenant_id", "barcode");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_salon_id_product_id_created_at_idx" ON "stock_movements"("tenant_id", "salon_id", "product_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_tenant_id_id_key" ON "stock_movements"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_id_key" ON "purchase_orders"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_tenant_id_number_key" ON "purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_tenant_id_id_key" ON "purchase_order_lines"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_tenant_id_id_key" ON "stock_transfers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "commission_rules_tenant_id_id_key" ON "commission_rules"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "commission_entries_tenant_id_staff_id_earned_at_idx" ON "commission_entries"("tenant_id", "staff_id", "earned_at");

-- CreateIndex
CREATE UNIQUE INDEX "commission_entries_tenant_id_id_key" ON "commission_entries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_tenant_id_id_key" ON "payroll_periods"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_tenant_id_period_start_period_end_key" ON "payroll_periods"("tenant_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_tenant_id_id_key" ON "payslips"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_tenant_id_payroll_period_id_staff_id_key" ON "payslips"("tenant_id", "payroll_period_id", "staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_advances_tenant_id_id_key" ON "staff_advances"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "loyalty_transactions_tenant_id_client_id_created_at_idx" ON "loyalty_transactions"("tenant_id", "client_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_transactions_tenant_id_id_key" ON "loyalty_transactions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_tenant_id_id_key" ON "gift_cards"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gift_cards_tenant_id_code_hash_key" ON "gift_cards"("tenant_id", "code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "gift_card_transactions_tenant_id_id_key" ON "gift_card_transactions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "prepaid_packages_tenant_id_id_key" ON "prepaid_packages"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "client_packages_tenant_id_client_id_status_idx" ON "client_packages"("tenant_id", "client_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "client_packages_tenant_id_id_key" ON "client_packages"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "client_package_usages_tenant_id_id_key" ON "client_package_usages"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_tenant_id_id_key" ON "promotions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_tenant_id_code_key" ON "promotions"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "promotion_redemptions_tenant_id_promotion_id_client_id_idx" ON "promotion_redemptions"("tenant_id", "promotion_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_redemptions_tenant_id_id_key" ON "promotion_redemptions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_id_key" ON "notification_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_tenant_id_event_channel_key" ON "notification_templates"("tenant_id", "event", "channel");

-- CreateIndex
CREATE INDEX "notifications_tenant_id_client_id_created_at_idx" ON "notifications"("tenant_id", "client_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_status_scheduled_for_idx" ON "notifications"("status", "scheduled_for");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_tenant_id_id_key" ON "notifications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_tenant_id_id_key" ON "campaigns"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "reviews_tenant_id_salon_id_status_idx" ON "reviews"("tenant_id", "salon_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_tenant_id_id_key" ON "reviews"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_tenant_id_appointment_id_key" ON "reviews"("tenant_id", "appointment_id");

-- CreateIndex
CREATE INDEX "complaints_tenant_id_status_idx" ON "complaints"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "complaints_tenant_id_id_key" ON "complaints"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_endpoints_tenant_id_id_key" ON "webhook_endpoints"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_prefix_key" ON "api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_tenant_id_id_key" ON "api_keys"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_entity_type_entity_id_idx" ON "audit_logs"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "outbox_events_status_available_at_idx" ON "outbox_events"("status", "available_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_staff" ADD CONSTRAINT "platform_staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_features" ADD CONSTRAINT "plan_features_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_domains" ADD CONSTRAINT "tenant_domains_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_invoices" ADD CONSTRAINT "saas_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "saas_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_payments" ADD CONSTRAINT "saas_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "saas_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_overrides" ADD CONSTRAINT "feature_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impersonation_grants" ADD CONSTRAINT "impersonation_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_settings" ADD CONSTRAINT "tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salons" ADD CONSTRAINT "salons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_opening_hours" ADD CONSTRAINT "salon_opening_hours_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salon_closures" ADD CONSTRAINT "salon_closures_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resources" ADD CONSTRAINT "resources_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_code_fkey" FOREIGN KEY ("permission_code") REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_roles" ADD CONSTRAINT "membership_roles_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_salons" ADD CONSTRAINT "membership_salons_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_salons" ADD CONSTRAINT "membership_salons_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_members" ADD CONSTRAINT "staff_members_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salons" ADD CONSTRAINT "staff_salons_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salons" ADD CONSTRAINT "staff_salons_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_skills" ADD CONSTRAINT "staff_skills_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_schedules" ADD CONSTRAINT "staff_schedules_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_time_off" ADD CONSTRAINT "staff_time_off_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_clock_entries" ADD CONSTRAINT "time_clock_entries_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "time_clock_entries" ADD CONSTRAINT "time_clock_entries_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "service_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_variants" ADD CONSTRAINT "service_variants_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_steps" ADD CONSTRAINT "service_steps_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_salon_prices" ADD CONSTRAINT "service_salon_prices_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_salon_prices" ADD CONSTRAINT "service_salon_prices_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_packages" ADD CONSTRAINT "service_packages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_package_items" ADD CONSTRAINT "service_package_items_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "service_packages"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_package_items" ADD CONSTRAINT "service_package_items_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_tenant_id_preferred_salon_id_fkey" FOREIGN KEY ("tenant_id", "preferred_salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_tenant_id_preferred_staff_id_fkey" FOREIGN KEY ("tenant_id", "preferred_staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_tenant_id_referred_by_id_fkey" FOREIGN KEY ("tenant_id", "referred_by_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_consents" ADD CONSTRAINT "client_consents_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_technical_notes" ADD CONSTRAINT "client_technical_notes_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_technical_notes" ADD CONSTRAINT "client_technical_notes_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_photos" ADD CONSTRAINT "client_photos_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_notes" ADD CONSTRAINT "client_notes_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "service_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_items" ADD CONSTRAINT "appointment_items_tenant_id_resource_id_fkey" FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "resources"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_busy_slots" ADD CONSTRAINT "staff_busy_slots_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_busy_slots" ADD CONSTRAINT "staff_busy_slots_tenant_id_item_id_fkey" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "appointment_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_busy_slots" ADD CONSTRAINT "staff_busy_slots_tenant_id_hold_id_fkey" FOREIGN KEY ("tenant_id", "hold_id") REFERENCES "booking_holds"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_busy_slots" ADD CONSTRAINT "resource_busy_slots_tenant_id_resource_id_fkey" FOREIGN KEY ("tenant_id", "resource_id") REFERENCES "resources"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_busy_slots" ADD CONSTRAINT "resource_busy_slots_tenant_id_item_id_fkey" FOREIGN KEY ("tenant_id", "item_id") REFERENCES "appointment_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_busy_slots" ADD CONSTRAINT "resource_busy_slots_tenant_id_hold_id_fkey" FOREIGN KEY ("tenant_id", "hold_id") REFERENCES "booking_holds"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "service_variants"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_holds" ADD CONSTRAINT "booking_holds_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_status_history" ADD CONSTRAINT "appointment_status_history_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_preferred_staff_id_fkey" FOREIGN KEY ("tenant_id", "preferred_staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_assigned_staff_id_fkey" FOREIGN KEY ("tenant_id", "assigned_staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waitlist_entries" ADD CONSTRAINT "waitlist_entries_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_cash_session_id_fkey" FOREIGN KEY ("tenant_id", "cash_session_id") REFERENCES "cash_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_tenant_id_promotion_id_fkey" FOREIGN KEY ("tenant_id", "promotion_id") REFERENCES "promotions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "service_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_appointment_item_id_fkey" FOREIGN KEY ("tenant_id", "appointment_item_id") REFERENCES "appointment_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_prepaid_package_id_fkey" FOREIGN KEY ("tenant_id", "prepaid_package_id") REFERENCES "prepaid_packages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_items" ADD CONSTRAINT "sale_items_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_cash_session_id_fkey" FOREIGN KEY ("tenant_id", "cash_session_id") REFERENCES "cash_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_gift_card_id_fkey" FOREIGN KEY ("tenant_id", "gift_card_id") REFERENCES "gift_cards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_tenant_id_cash_session_id_fkey" FOREIGN KEY ("tenant_id", "cash_session_id") REFERENCES "cash_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_tenant_id_refund_id_fkey" FOREIGN KEY ("tenant_id", "refund_id") REFERENCES "refunds"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_items" ADD CONSTRAINT "refund_items_tenant_id_sale_item_id_fkey" FOREIGN KEY ("tenant_id", "sale_item_id") REFERENCES "sale_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_tenant_id_register_id_fkey" FOREIGN KEY ("tenant_id", "register_id") REFERENCES "cash_registers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_cash_session_id_fkey" FOREIGN KEY ("tenant_id", "cash_session_id") REFERENCES "cash_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_credited_invoice_id_fkey" FOREIGN KEY ("tenant_id", "credited_invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_tenant_id_invoice_id_fkey" FOREIGN KEY ("tenant_id", "invoice_id") REFERENCES "invoices"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_refund_id_fkey" FOREIGN KEY ("tenant_id", "refund_id") REFERENCES "refunds"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_cash_session_id_fkey" FOREIGN KEY ("tenant_id", "cash_session_id") REFERENCES "cash_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_cash_movement_id_fkey" FOREIGN KEY ("tenant_id", "cash_movement_id") REFERENCES "cash_movements"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_tenant_id_expense_id_fkey" FOREIGN KEY ("tenant_id", "expense_id") REFERENCES "expenses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "expense_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_purchase_order_id_fkey" FOREIGN KEY ("tenant_id", "purchase_order_id") REFERENCES "purchase_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_cash_session_id_fkey" FOREIGN KEY ("tenant_id", "cash_session_id") REFERENCES "cash_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_payroll_period_id_fkey" FOREIGN KEY ("tenant_id", "payroll_period_id") REFERENCES "payroll_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_stocks" ADD CONSTRAINT "product_stocks_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_purchase_order_line_id_fkey" FOREIGN KEY ("tenant_id", "purchase_order_line_id") REFERENCES "purchase_order_lines"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_transfer_id_fkey" FOREIGN KEY ("tenant_id", "transfer_id") REFERENCES "stock_transfers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_consumptions" ADD CONSTRAINT "service_consumptions_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_consumptions" ADD CONSTRAINT "service_consumptions_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_tenant_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_tenant_id_purchase_order_id_fkey" FOREIGN KEY ("tenant_id", "purchase_order_id") REFERENCES "purchase_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_from_salon_id_fkey" FOREIGN KEY ("tenant_id", "from_salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_tenant_id_to_salon_id_fkey" FOREIGN KEY ("tenant_id", "to_salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_tenant_id_transfer_id_fkey" FOREIGN KEY ("tenant_id", "transfer_id") REFERENCES "stock_transfers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_service_category_id_fkey" FOREIGN KEY ("tenant_id", "service_category_id") REFERENCES "service_categories"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "products"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_tenant_id_sale_item_id_fkey" FOREIGN KEY ("tenant_id", "sale_item_id") REFERENCES "sale_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_tenant_id_rule_id_fkey" FOREIGN KEY ("tenant_id", "rule_id") REFERENCES "commission_rules"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_entries" ADD CONSTRAINT "commission_entries_tenant_id_payroll_period_id_fkey" FOREIGN KEY ("tenant_id", "payroll_period_id") REFERENCES "payroll_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_payroll_period_id_fkey" FOREIGN KEY ("tenant_id", "payroll_period_id") REFERENCES "payroll_periods"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_advances" ADD CONSTRAINT "staff_advances_tenant_id_payroll_period_id_fkey" FOREIGN KEY ("tenant_id", "payroll_period_id") REFERENCES "payroll_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_tenant_id_buyer_client_id_fkey" FOREIGN KEY ("tenant_id", "buyer_client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_cards" ADD CONSTRAINT "gift_cards_tenant_id_owner_client_id_fkey" FOREIGN KEY ("tenant_id", "owner_client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_tenant_id_gift_card_id_fkey" FOREIGN KEY ("tenant_id", "gift_card_id") REFERENCES "gift_cards"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_card_transactions" ADD CONSTRAINT "gift_card_transactions_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_packages" ADD CONSTRAINT "prepaid_packages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prepaid_packages" ADD CONSTRAINT "prepaid_packages_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_packages" ADD CONSTRAINT "client_packages_tenant_id_prepaid_package_id_fkey" FOREIGN KEY ("tenant_id", "prepaid_package_id") REFERENCES "prepaid_packages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_package_usages" ADD CONSTRAINT "client_package_usages_tenant_id_client_package_id_fkey" FOREIGN KEY ("tenant_id", "client_package_id") REFERENCES "client_packages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_package_usages" ADD CONSTRAINT "client_package_usages_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_tenant_id_promotion_id_fkey" FOREIGN KEY ("tenant_id", "promotion_id") REFERENCES "promotions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_campaign_id_fkey" FOREIGN KEY ("tenant_id", "campaign_id") REFERENCES "campaigns"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenant_id_campaign_id_fkey" FOREIGN KEY ("tenant_id", "campaign_id") REFERENCES "campaigns"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_recipients" ADD CONSTRAINT "campaign_recipients_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "appointments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenant_id_staff_id_fkey" FOREIGN KEY ("tenant_id", "staff_id") REFERENCES "staff_members"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenant_id_salon_id_fkey" FOREIGN KEY ("tenant_id", "salon_id") REFERENCES "salons"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_tenant_id_client_id_fkey" FOREIGN KEY ("tenant_id", "client_id") REFERENCES "client_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

