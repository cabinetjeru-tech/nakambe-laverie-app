-- AlterTable
ALTER TABLE "orders" DROP COLUMN "deliveryCodeHash",
ADD COLUMN     "cashCollectAt" "StopKind",
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "deliveryCode" TEXT,
ADD COLUMN     "dispatchAlertedAt" TIMESTAMP(3),
ADD COLUMN     "dispatchAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "lastDispatchAt" TIMESTAMP(3),
ADD COLUMN     "trackingToken" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "orders_trackingToken_key" ON "orders"("trackingToken");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");

