-- CreateEnum
CREATE TYPE "MerchantOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'READY', 'REJECTED');

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'MERCHANT_MEDIA';

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "description" TEXT,
ADD COLUMN     "minOrderAmount" INTEGER,
ADD COLUMN     "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "ratingCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dispatchAfter" TIMESTAMP(3),
ADD COLUMN     "merchantAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "merchantCommissionAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "merchantEarning" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "merchantStatus" "MerchantOrderStatus",
ADD COLUMN     "prepMinutes" INTEGER,
ADD COLUMN     "readyAt" TIMESTAMP(3);

