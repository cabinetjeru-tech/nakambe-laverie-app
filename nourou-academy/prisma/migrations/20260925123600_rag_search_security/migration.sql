-- ─────────────────────────────────────────────────────────────────────────────
-- RAG : recherche plein texte (français) + index vectoriel (pgvector, HNSW)
-- ─────────────────────────────────────────────────────────────────────────────

-- Colonne tsvector générée automatiquement à partir du titre de section et du contenu.
ALTER TABLE "KnowledgeChunk"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('french', coalesce("heading", '')), 'A') ||
    setweight(to_tsvector('french', coalesce("content", '')), 'B')
  ) STORED;

CREATE INDEX "KnowledgeChunk_tsv_idx" ON "KnowledgeChunk" USING GIN ("tsv");

-- Index HNSW pour la similarité cosinus (pgvector >= 0.5).
CREATE INDEX "KnowledgeChunk_embedding_idx" ON "KnowledgeChunk"
  USING hnsw ("embedding" vector_cosine_ops);

-- Recherche plein texte dans le catalogue.
CREATE INDEX "Course_search_idx" ON "Course" USING GIN (
  to_tsvector('french', coalesce("title", '') || ' ' || coalesce("subtitle", '') || ' ' || coalesce("description", ''))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Sécurité en profondeur : Row Level Security
--
-- L'application accède à la base uniquement côté serveur, avec le rôle
-- propriétaire des tables (qui n'est pas soumis au RLS). Les contrôles d'accès
-- métier sont appliqués dans le code serveur (src/lib/access.ts).
--
-- On active malgré tout le RLS sur toutes les tables : si la base est exposée
-- via une API automatique (ex. PostgREST de Supabase, rôles "anon" et
-- "authenticated"), aucune ligne n'est lisible sans politique explicite.
-- Seules les données publiques du catalogue reçoivent une politique de lecture.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'CREATE POLICY "public_read_published_courses" ON "Course" FOR SELECT TO anon, authenticated USING (status = ''PUBLISHED'')';
    EXECUTE 'CREATE POLICY "public_read_categories" ON "Category" FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'CREATE POLICY "public_read_faq" ON "Faq" FOR SELECT TO anon, authenticated USING (true)';
    EXECUTE 'CREATE POLICY "public_read_blog" ON "BlogPost" FOR SELECT TO anon, authenticated USING (published = true)';
    EXECUTE 'CREATE POLICY "public_read_certificates" ON "Certificate" FOR SELECT TO anon, authenticated USING (status = ''VALID'')';
    -- Les secrets, paiements, utilisateurs, contenus pédagogiques payants et index RAG
    -- restent inaccessibles à ces rôles (aucune politique = aucun accès).
    EXECUTE 'REVOKE ALL ON "Setting", "Session", "PasswordResetToken", "User", "KnowledgeChunk", "KnowledgeDocument" FROM anon, authenticated';
  END IF;
END $$;
