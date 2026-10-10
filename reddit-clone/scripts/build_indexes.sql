-- Per-month indexes the website relies on: thread lookup (id), user pages
-- (author, created_utc) and the all-subreddit "Top" feed (score).
-- Usage: docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt < scripts/build_indexes.sql
SET maintenance_work_mem = '2GB';
SET max_parallel_maintenance_workers = 4;
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
             AND c.relname ~ '^rs_\d{4}_\d{2}$' ORDER BY c.relname
  LOOP
    RAISE NOTICE '% indexing %', clock_timestamp(), t;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (id)', t || '_id_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (author, created_utc DESC)', t || '_author_created_idx', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I (score DESC)', t || '_score_idx', t);
    EXECUTE format('ANALYZE %I', t);
    COMMIT;
  END LOOP;
END $$;
