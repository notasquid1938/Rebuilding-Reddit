-- Small lookup tables the website reads instead of scanning every monthly
-- table (which matters once months live on a spinning disk):
--   post_id_ranges    base-36 id range of each month -> thread lookups touch one table
--   subreddit_monthly posts per subreddit per month   -> community feeds skip empty months
--   top_posts         top 1000 posts of each month     -> unfiltered "Top" feeds
--   feed_rollup       candidates for the other sorts    -> Controversial / Most comments / New / Old feeds
-- refresh_month(table) (re)computes all four for one rs_YYYY_MM table.
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
