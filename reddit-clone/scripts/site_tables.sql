-- Small lookup tables the website reads instead of scanning every monthly
-- table (which matters once months live on a spinning disk):
--   post_id_ranges    base-36 id range of each month -> thread lookups touch one table
--   subreddit_monthly posts per subreddit per month   -> community feeds skip empty months
--   top_posts         top 1000 posts of each month     -> unfiltered "Top" feeds
--   feed_rollup       candidates for the other sorts    -> Controversial / Most comments / New / Old feeds
--   author_months     the months each author posted in  -> user pages skip the other months
-- refresh_month(table) (re)computes all five for one rs_YYYY_MM table.
-- Idempotent; run by dump_loader.py at startup.

CREATE OR REPLACE FUNCTION base36_to_bigint(value text) RETURNS bigint
LANGUAGE plpgsql IMMUTABLE STRICT AS $$
DECLARE
  result bigint := 0;
  ch text;
BEGIN
  FOREACH ch IN ARRAY regexp_split_to_array(lower(value), '') LOOP
    result := result * 36 + (strpos('0123456789abcdefghijklmnopqrstuvwxyz', ch) - 1);
  END LOOP;
  RETURN result;
END $$;

CREATE TABLE IF NOT EXISTS post_id_ranges (
  table_name text PRIMARY KEY,
  month      date   NOT NULL,
  id_min     bigint NOT NULL,
  id_max     bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS subreddit_monthly (
  subreddit text    NOT NULL,
  month     date    NOT NULL,
  posts     integer NOT NULL,
  PRIMARY KEY (subreddit, month)
);
CREATE INDEX IF NOT EXISTS subreddit_monthly_month_idx ON subreddit_monthly (month);

CREATE TABLE IF NOT EXISTS top_posts (
  month           date NOT NULL,
  id              text,
  author          text,
  subreddit       text,
  title           text,
  url             text,
  domain          text,
  num_comments    text,
  is_self         text,
  over_18         text,
  spoiler         text,
  stickied        text,
  link_flair_text text,
  thumbnail       text,
  distinguished   text,
  score           numeric,
  created_utc     numeric,
  selftext        text
);
CREATE INDEX IF NOT EXISTS top_posts_month_score_idx ON top_posts (month, score DESC);

CREATE OR REPLACE PROCEDURE refresh_month(tbl text, top_n integer DEFAULT 1000)
LANGUAGE plpgsql AS $$
DECLARE
  m date := to_date(substr(tbl, 4), 'YYYY_MM');
  has_col boolean;
  cols text := '';
  col text;
BEGIN
  -- id range: compare by length first, since base-36 ids grow in length over time
  DELETE FROM post_id_ranges WHERE table_name = tbl;
  EXECUTE format(
    'INSERT INTO post_id_ranges (table_name, month, id_min, id_max)
     SELECT %L, %L::date,
            base36_to_bigint((array_agg(mn ORDER BY len))[1]),
            base36_to_bigint((array_agg(mx ORDER BY len DESC))[1])
       FROM (SELECT length(id) AS len, min(id) AS mn, max(id) AS mx
               FROM %I WHERE id ~ ''^[0-9a-z]+$'' GROUP BY 1) s
     HAVING count(*) > 0', tbl, m, tbl);

  SELECT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = 'subreddit' AND NOT attisdropped)
    INTO has_col;
  DELETE FROM subreddit_monthly WHERE month = m;
  IF has_col THEN
    EXECUTE format(
      'INSERT INTO subreddit_monthly (subreddit, month, posts)
       SELECT subreddit, %L::date, count(*) FROM %I
        WHERE subreddit IS NOT NULL AND subreddit NOT IN ('''', ''None'')
        GROUP BY subreddit', m, tbl);
  END IF;

  -- Columns missing from older months become NULL
  FOREACH col IN ARRAY ARRAY['id', 'author', 'subreddit', 'title', 'url', 'domain', 'num_comments', 'is_self',
                             'over_18', 'spoiler', 'stickied', 'link_flair_text', 'thumbnail', 'distinguished'] LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = col AND NOT attisdropped) THEN
      cols := cols || format('%I::text, ', col);
    ELSE
      cols := cols || 'NULL, ';
    END IF;
  END LOOP;
  DELETE FROM top_posts WHERE month = m;
  EXECUTE format(
    'INSERT INTO top_posts (month, id, author, subreddit, title, url, domain, num_comments, is_self, over_18,
                            spoiler, stickied, link_flair_text, thumbnail, distinguished, score, created_utc, selftext)
     SELECT %L::date, %s score, created_utc, left(selftext, 700)
       FROM %I ORDER BY score DESC NULLS LAST LIMIT %s', m, cols, tbl, top_n);

  CALL refresh_feed_rollup(tbl);
  CALL refresh_author_months(tbl);
END $$;


-- The monthly tables only have indexes for Top, so the other sorts read
-- feed_rollup: per subreddit per month (and per month for the front page,
-- subreddit = ''), the posts that rank in the first `per_sub` (front page:
-- `per_month`) for any of Controversial, Most comments, New or Old, with the
-- values those sorts need. Version 2 rows also keep each community's Top
-- posts: a community's all-time Top through the monthly indexes reads the
-- leading post of every month, hundreds of random reads on the archive disk. A listing built from it is exact until some month
-- with more posts than were kept has given up all of its kept posts for that
-- sort; the website stops there (lib/submissions.js).
CREATE TABLE IF NOT EXISTS feed_rollup (
  subreddit text      NOT NULL,
  month     date      NOT NULL,
  posts     integer   NOT NULL,  -- all posts in the subreddit that month
  kept      integer   NOT NULL,  -- how many each sort kept (per_sub / per_month)
  ids       bigint[]  NOT NULL,  -- base-36 post ids as numbers
  created   integer[] NOT NULL,
  scores    integer[] NOT NULL,
  comments  integer[] NOT NULL,
  PRIMARY KEY (subreddit, month)
);
ALTER TABLE feed_rollup ADD COLUMN IF NOT EXISTS version smallint NOT NULL DEFAULT 1;

-- Ranking keys; lib/submissions.js uses the same expressions. Controversial:
-- Reddit's own ranking needs downvotes, which the dumps don't have, so it is
-- approximated as many comments for little net score.
CREATE OR REPLACE FUNCTION controversy(score integer, comments integer) RETURNS double precision
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(comments, 0)::double precision / (abs(coalesce(score, 0)) + 10) * ln(coalesce(comments, 0) + 1)
$$;

CREATE OR REPLACE PROCEDURE refresh_feed_rollup(tbl text, per_sub integer DEFAULT 100, per_month integer DEFAULT 1000)
LANGUAGE plpgsql AS $$
DECLARE
  m date := to_date(substr(tbl, 4), 'YYYY_MM');
  col_sql text := '';
  col text;
BEGIN
  -- One pass over the month into a narrow copy; columns missing from older months become NULL
  FOREACH col IN ARRAY ARRAY['subreddit', 'num_comments', 'created_utc'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = col AND NOT attisdropped) THEN
      col_sql := col_sql || format('NULL::text AS %I, ', col);
    ELSE
      col_sql := col_sql || format('%I::text AS %I, ', col, col);
    END IF;
  END LOOP;
  IF to_regclass('pg_temp.feed_rollup_scan') IS NOT NULL THEN
    DROP TABLE feed_rollup_scan;
  END IF;
  EXECUTE format(
    'CREATE TEMP TABLE feed_rollup_scan AS
     SELECT CASE WHEN subreddit IN (''None'', '''') THEN NULL ELSE subreddit END AS subreddit, id,
            CASE WHEN created_utc ~ ''^[0-9]{1,10}(\.0*)?$'' THEN least(created_utc::numeric, 2147483647)::integer ELSE 0 END AS created,
            greatest(least(coalesce(score, 0), 2147483647), -2147483647)::integer AS score,
            CASE WHEN num_comments ~ ''^[0-9]{1,9}$'' THEN num_comments::integer ELSE 0 END AS comments
       FROM (SELECT %s id, score FROM %I WHERE id ~ ''^[0-9a-z]{1,12}$'') s', col_sql, tbl);

  DELETE FROM feed_rollup WHERE month = m;
  INSERT INTO feed_rollup (subreddit, month, posts, kept, ids, created, scores, comments, version)
  SELECT coalesce(subreddit, ''), m, max(n), per_sub, array_agg(base36_to_bigint(id)), array_agg(created),
         array_agg(score), array_agg(comments), 2
    FROM (SELECT *, count(*) OVER w AS n,
                 row_number() OVER (w ORDER BY controversy(score, comments) DESC, id DESC) AS r1,
                 row_number() OVER (w ORDER BY comments DESC, id DESC) AS r2,
                 row_number() OVER (w ORDER BY created DESC, id DESC) AS r3,
                 row_number() OVER (w ORDER BY created ASC, id ASC) AS r4,
                 row_number() OVER (w ORDER BY score DESC, id DESC) AS r5
            FROM feed_rollup_scan WHERE subreddit IS NOT NULL
          WINDOW w AS (PARTITION BY subreddit)) x
   WHERE least(r1, r2, r3, r4, r5) <= per_sub
   GROUP BY subreddit;

  -- Front page: every post of the month (LIMIT keeps these to cheap top-N sorts)
  INSERT INTO feed_rollup (subreddit, month, posts, kept, ids, created, scores, comments, version)
  SELECT '', m, (SELECT count(*) FROM feed_rollup_scan), per_month, array_agg(base36_to_bigint(id)),
         array_agg(created), array_agg(score), array_agg(comments), 2
    FROM ((SELECT id, created, score, comments FROM feed_rollup_scan
            ORDER BY controversy(score, comments) DESC, id DESC LIMIT per_month)
          UNION (SELECT id, created, score, comments FROM feed_rollup_scan ORDER BY comments DESC, id DESC LIMIT per_month)
          UNION (SELECT id, created, score, comments FROM feed_rollup_scan ORDER BY created DESC, id DESC LIMIT per_month)
          UNION (SELECT id, created, score, comments FROM feed_rollup_scan ORDER BY created ASC, id ASC LIMIT per_month)) x
  HAVING count(*) > 0;
  DROP TABLE feed_rollup_scan;
END $$;


-- The months each author posted in, so a user page reads only those months
-- instead of every monthly table (~1,400 locks and a random read per month on
-- the archive disk). One row per author rather than per author and month:
-- that would be ~850 million rows. Months are numbered from 2005-01
-- (month_number). The website only relies on it once build_author_months()
-- has filled it in for every month (a site_builds row); until then user pages
-- read every month as before.
CREATE TABLE IF NOT EXISTS author_months (
  author text PRIMARY KEY,
  months smallint[] NOT NULL
);

CREATE TABLE IF NOT EXISTS site_builds (
  name     text PRIMARY KEY,
  built_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION month_number(m date) RETURNS smallint
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT ((extract(year FROM m)::integer - 2005) * 12 + extract(month FROM m)::integer - 1)::smallint
$$;

-- Placeholders that aren't accounts
CREATE OR REPLACE FUNCTION is_account(author text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT author IS NOT NULL AND author NOT IN ('', '[deleted]', '[removed]', 'None')
$$;

-- Adds one month's authors. Run for every month as it loads (refresh_month),
-- and again when the gap-fill adds posts to it.
CREATE OR REPLACE PROCEDURE refresh_author_months(tbl text)
LANGUAGE plpgsql AS $$
DECLARE
  n smallint := month_number(to_date(substr(tbl, 4), 'YYYY_MM'));
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = 'author' AND NOT attisdropped) THEN
    RETURN;
  END IF;
  -- Months loading in parallel share most of their authors; upserting them at
  -- the same time deadlocks, so one month at a time (until the caller commits)
  PERFORM pg_advisory_xact_lock(4242002);
  EXECUTE format(
    'INSERT INTO author_months AS a (author, months)
     SELECT DISTINCT author, ARRAY[%s]::smallint[] FROM %I WHERE is_account(author)
     ON CONFLICT (author) DO UPDATE
       SET months = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(a.months || EXCLUDED.months) x)
     WHERE NOT a.months @> EXCLUDED.months', n, tbl);
END $$;

-- One-off fill of author_months from every month already loaded. Upserting
-- month by month would be a random read per author on a table this size, so
-- each month's authors are copied to a staging table (one sequential scan per
-- month) and grouped at the end. The staging table is split by author into 32
-- parts that are grouped and dropped one at a time, so the archive disk
-- (`work_tablespace`) needs ~40 GB at most for the full archive; the result
-- (~20 GB) goes to the default tablespace, where each new month's upserts are
-- cheap. Whatever refresh_month added meanwhile is kept. Every step commits,
-- so an interrupted build continues where it stopped. Run in its own session:
--   CALL build_author_months('archive_hdd');
CREATE OR REPLACE PROCEDURE build_author_months(work_tablespace text DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  parts constant integer := 32;
  tbl text;
  part text;
  ts text := CASE WHEN work_tablespace IS NULL THEN '' ELSE format(' TABLESPACE %I', work_tablespace) END;
BEGIN
  IF EXISTS (SELECT 1 FROM site_builds WHERE name = 'author_months') THEN
    RAISE NOTICE 'author_months is already built';
    RETURN;
  END IF;
  -- Each month's authors in one pass over its table, which is cheaper than
  -- the author index here: most archive-disk pages aren't marked all-visible,
  -- so an index-only scan would still visit the table at random
  PERFORM set_config('enable_indexscan', 'off', false);
  PERFORM set_config('enable_indexonlyscan', 'off', false);
  PERFORM set_config('enable_bitmapscan', 'off', false);
  PERFORM set_config('work_mem', '1GB', false);
  PERFORM set_config('maintenance_work_mem', '2GB', false);
  IF work_tablespace IS NOT NULL THEN
    PERFORM set_config('temp_tablespaces', work_tablespace, false);
  END IF;

  -- Staging (skipped once grouping has started, when author_months_new exists)
  IF to_regclass('author_months_new') IS NULL THEN
    IF to_regclass('author_months_stage') IS NULL THEN
      CREATE UNLOGGED TABLE author_months_stage (author text NOT NULL, month smallint NOT NULL) PARTITION BY HASH (author);
      FOR i IN 0 .. parts - 1 LOOP
        EXECUTE format('CREATE UNLOGGED TABLE author_months_stage_%s PARTITION OF author_months_stage
                        FOR VALUES WITH (MODULUS %s, REMAINDER %s)', i, parts, i) || ts;
      END LOOP;
    END IF;
    CREATE TABLE IF NOT EXISTS author_months_staged (table_name text PRIMARY KEY);
    COMMIT;
    -- Until no month is left, so months that finish loading meanwhile are included
    LOOP
      SELECT c.relname INTO tbl FROM pg_class c
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND c.relname ~ '^rs_\d{4}_\d{2}$'
         AND NOT EXISTS (SELECT 1 FROM author_months_staged s WHERE s.table_name = c.relname)
       ORDER BY c.relname LIMIT 1;
      EXIT WHEN tbl IS NULL;
      RAISE NOTICE '% staging %', clock_timestamp(), tbl;
      IF EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = tbl::regclass AND attname = 'author' AND NOT attisdropped) THEN
        EXECUTE format('INSERT INTO author_months_stage SELECT DISTINCT author, %s FROM %I WHERE is_account(author)',
                       month_number(to_date(substr(tbl, 4), 'YYYY_MM')), tbl);
      END IF;
      INSERT INTO author_months_staged VALUES (tbl);
      COMMIT;
    END LOOP;
    CREATE TABLE author_months_new (author text NOT NULL, months smallint[] NOT NULL);
    COMMIT;
  END IF;

  -- Grouping, one part at a time; each (author, month) was staged once, so no
  -- de-duplication is needed
  LOOP
    SELECT c.relname INTO part FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
     WHERE i.inhparent = to_regclass('author_months_stage') ORDER BY c.relname LIMIT 1;
    EXIT WHEN part IS NULL;
    RAISE NOTICE '% grouping %', clock_timestamp(), part;
    EXECUTE format('INSERT INTO author_months_new
                    SELECT author, array_agg(month ORDER BY month) FROM %I GROUP BY author', part);
    EXECUTE format('DROP TABLE %I', part);
    COMMIT;
  END LOOP;
  RAISE NOTICE '% indexing', clock_timestamp();
  IF to_regclass('author_months_new_pkey') IS NULL THEN
    ALTER TABLE author_months_new ADD CONSTRAINT author_months_new_pkey PRIMARY KEY (author);
  END IF;
  COMMIT;

  -- Fold in what refresh_month added meanwhile, holding off its upserts until the swap
  LOCK TABLE author_months IN SHARE ROW EXCLUSIVE MODE;
  INSERT INTO author_months_new AS a SELECT author, months FROM author_months
  ON CONFLICT (author) DO UPDATE
    SET months = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(a.months || EXCLUDED.months) x)
  WHERE NOT a.months @> EXCLUDED.months;
  DROP TABLE author_months;
  ALTER TABLE author_months_new RENAME TO author_months;
  ALTER INDEX author_months_new_pkey RENAME TO author_months_pkey;
  INSERT INTO site_builds (name) VALUES ('author_months');
  DROP TABLE IF EXISTS author_months_stage;
  DROP TABLE IF EXISTS author_months_staged;
  COMMIT;
  RAISE NOTICE '% author_months built', clock_timestamp();
END $$;
