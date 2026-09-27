-- Annuaire des formateurs géré par l'administration : visibilité publique et ordre d'affichage.
ALTER TABLE "User" ADD COLUMN "showOnSite" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "displayOrder" INTEGER NOT NULL DEFAULT 0;
