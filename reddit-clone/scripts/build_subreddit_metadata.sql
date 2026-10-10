-- Builds the lookup tables used by the website:
--   subreddit_monthly   (subreddit, month, posts)          per-month post counts
--   subreddits_metadata (name, entry_count, first_seen,    search suggestions,
--                        last_seen, post_count)            name resolution
-- Safe to re-run after loading new months; it refreshes every month it finds.
-- Usage: docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt < scripts/build_subreddit_metadata.sql

SET work_mem = '512MB';

CREATE TABLE IF NOT EXISTS subreddit_monthly (
  subreddit text    NOT NULL,
  month     date    NOT NULL,
  posts     integer NOT NULL,
  PRIMARY KEY (subreddit, month)
);
CREATE INDEX IF NOT EXISTS subreddit_monthly_month_idx ON subreddit_monthly (month);

DO $$
DECLARE
  t text;
  m date;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname ~ '^rs_\d{4}_\d{2}$'
       AND pg_relation_size(c.oid) > 0
       AND EXISTS (SELECT 1 FROM pg_attribute a
                    WHERE a.attrelid = c.oid AND a.attname = 'subreddit' AND NOT a.attisdropped)
     ORDER BY c.relname
  LOOP
    m := to_date(substr(t, 4), 'YYYY_MM');
    RAISE NOTICE '% counting %', clock_timestamp(), t;
    DELETE FROM subreddit_monthly WHERE month = m;
    EXECUTE format(
      'INSERT INTO subreddit_monthly (subreddit, month, posts)
       SELECT subreddit, %L::date, count(*) FROM %I
        WHERE subreddit IS NOT NULL AND subreddit NOT IN ('''', ''None'')
        GROUP BY subreddit', m, t);
    COMMIT;
  END LOOP;
END $$;

BEGIN;
DROP TABLE IF EXISTS subreddits_metadata_new;
CREATE TABLE subreddits_metadata_new AS
  SELECT subreddit                                        AS name,
         count(*)::integer                                AS entry_count,
         min(month)                                       AS first_seen,
         (max(month) + interval '1 month - 1 day')::date  AS last_seen,
         sum(posts)::bigint                               AS post_count
    FROM subreddit_monthly
   GROUP BY subreddit;
CREATE INDEX ON subreddits_metadata_new (lower(name) text_pattern_ops);
CREATE INDEX ON subreddits_metadata_new (post_count DESC);
DROP TABLE IF EXISTS subreddits_metadata;
ALTER TABLE subreddits_metadata_new RENAME TO subreddits_metadata;
COMMIT;

ANALYZE subreddit_monthly;
ANALYZE subreddits_metadata;
