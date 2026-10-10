-- Small lookup tables the website reads instead of scanning every monthly
-- table (which matters once months live on a spinning disk):
--   post_id_ranges    base-36 id range of each month -> thread lookups touch one table
--   subreddit_monthly posts per subreddit per month   -> community feeds skip empty months
--   top_posts         top 1000 posts of each month     -> unfiltered "Top" feeds
-- refresh_month(table) (re)computes all three for one rs_YYYY_MM table.
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
END $$;
