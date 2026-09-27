-- Médias de présentation des formations (image + vidéo) et politique « consultation en ligne ».
ALTER TABLE "Course" ADD COLUMN "trailerFileId" TEXT;
ALTER TABLE "Course" ADD COLUMN "trailerUrl" TEXT;

-- Les vidéos et sous-titres des leçons se consultent en ligne : plus de téléchargement.
-- Les documents déjà publiés restent des ressources téléchargeables.
UPDATE "LessonAsset" SET "downloadable" = false WHERE "kind" IN ('VIDEO', 'SUBTITLE');
