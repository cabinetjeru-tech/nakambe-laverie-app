-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "gpsAccuracy" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "currentLat" DOUBLE PRECISION,
ADD COLUMN     "currentLng" DOUBLE PRECISION,
ADD COLUMN     "locationUpdatedAt" TIMESTAMP(3);

