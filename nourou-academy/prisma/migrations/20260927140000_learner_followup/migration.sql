-- Suivi des apprenants : relances automatiques et notes internes de l'équipe.
ALTER TABLE "Enrollment" ADD COLUMN "nudgeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Enrollment" ADD COLUMN "lastNudgeAt" TIMESTAMP(3);

CREATE TABLE "LearnerNote" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "followUpAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearnerNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LearnerNote_learnerId_createdAt_idx" ON "LearnerNote"("learnerId", "createdAt");
CREATE INDEX "LearnerNote_followUpAt_idx" ON "LearnerNote"("followUpAt");
ALTER TABLE "LearnerNote" ADD CONSTRAINT "LearnerNote_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LearnerNote" ADD CONSTRAINT "LearnerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Même règle que les autres tables : RLS activé, aucun accès pour les rôles d'API automatique.
ALTER TABLE "LearnerNote" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "LearnerNote" FROM anon, authenticated';
  END IF;
END $$;
