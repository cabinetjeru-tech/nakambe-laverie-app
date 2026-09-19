-- CreateEnum
CREATE TYPE "PaymentTiming" AS ENUM ('AVANT_PRESTATION', 'APRES_PRESTATION');

-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('EN_ATTENTE', 'CONFIRME', 'ECHEC', 'ANNULE');

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CHEQUE';

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "gpsLat" DOUBLE PRECISION,
ADD COLUMN     "gpsLng" DOUBLE PRECISION,
ADD COLUMN     "paymentTiming" "PaymentTiming" NOT NULL DEFAULT 'APRES_PRESTATION',
ADD COLUMN     "quoteId" TEXT;

-- CreateTable
CREATE TABLE "online_payment_transactions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'LIGDICASH',
    "clientId" TEXT NOT NULL,
    "quoteId" TEXT,
    "invoiceId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "operatorName" TEXT,
    "rawResponse" JSONB,
    "paymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_transactions_token_key" ON "online_payment_transactions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "online_payment_transactions_paymentId_key" ON "online_payment_transactions"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_quoteId_key" ON "appointments"("quoteId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_transactions" ADD CONSTRAINT "online_payment_transactions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_transactions" ADD CONSTRAINT "online_payment_transactions_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_transactions" ADD CONSTRAINT "online_payment_transactions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_payment_transactions" ADD CONSTRAINT "online_payment_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

