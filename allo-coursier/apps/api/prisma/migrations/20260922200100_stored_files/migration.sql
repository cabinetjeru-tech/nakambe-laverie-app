-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('DRIVER_DOCUMENT', 'DELIVERY_PROOF', 'RECEIPT', 'CHAT', 'COMPLAINT', 'AVATAR');

-- CreateTable
CREATE TABLE "stored_files" (
    "key" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "purpose" "FilePurpose" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "stored_files_ownerId_idx" ON "stored_files"("ownerId");

