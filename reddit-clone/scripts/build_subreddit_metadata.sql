-- Builds the lookup tables used by the website (see site_tables.sql) for any
-- month that doesn't have them yet, then rebuilds subreddits_metadata
-- (search suggestions, community stats). Safe to re-run.
-- Requires the objects from site_tables.sql, so run the two together:
--   cat scripts/site_tables.sql scripts/build_subreddit_metadata.sql | \
--     docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt -v ON_ERROR_STOP=1

SET work_mem = '512MB';

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
       AND c.relname ~ '^rs_\d{4}_\d{2}$'
       AND pg_relation_size(c.oid) > 0
       AND NOT EXISTS (SELECT 1 FROM post_id_ranges r WHERE r.table_name = c.relname)
     ORDER BY c.relname
  LOOP
    RAISE NOTICE '% refreshing %', clock_timestamp(), t;
    CALL refresh_month(t);
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

ANALYZE post_id_ranges;
ANALYZE subreddit_monthly;
ANALYZE top_posts;
ANALYZE subreddits_metadata;
