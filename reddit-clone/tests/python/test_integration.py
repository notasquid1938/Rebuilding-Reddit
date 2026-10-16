"""
Checks the database produced by loading tests/fixtures into an empty test
database (see tests/run-integration.sh, which loads it before running these).
"""
import os
import subprocess
import sys

import pytest

from dump_loader import connect

pytestmark = pytest.mark.integration

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
MONTHS = ['2005_12', '2006_01', '2006_02', '2010_06']


@pytest.fixture(scope='module')
def db():
    conn = connect()
    conn.autocommit = True
    yield conn.cursor()
    conn.close()


def one(cur, query, params=None):
    cur.execute(query, params)
    return cur.fetchone()


def test_every_month_loaded_with_expected_counts(db):
    db.execute("SELECT file, rows_loaded, rows_failed FROM loader_state WHERE file LIKE 'R%' ORDER BY file")
    assert db.fetchall() == [
        ('RC_2005-12.zst', 5, 0),
        ('RC_2006-01.zst', 1, 0),
        ('RS_2005-12.zst', 45, 2),  # the two malformed lines are counted, not loaded
        ('RS_2006-01.zst', 32, 0),
        ('RS_2006-02.zst', 11, 0),
        ('RS_2010-06.zst', 6, 0),
    ]


def test_staging_tables_swapped_out(db):
    assert one(db, "SELECT count(*) FROM pg_class WHERE relname LIKE '%\\_loading'")[0] == 0


@pytest.mark.parametrize('month', MONTHS)
def test_month_tables_are_logged_and_indexed(db, month):
    table = f'rs_{month}'
    assert one(db, 'SELECT relpersistence FROM pg_class WHERE relname = %s', (table,))[0] == 'p'
    db.execute('SELECT indexname FROM pg_indexes WHERE tablename = %s ORDER BY 1', (table,))
    assert [r[0] for r in db.fetchall()] == [
        f'{table}_author_created_idx', f'{table}_id_idx', f'{table}_score_idx', f'{table}_sub_score_idx']


def test_values_survive_the_round_trip(db):
    title, selftext, score, created = one(
        db, "SELECT title, selftext, score, created_utc FROM rs_2005_12 WHERE id = 'b002'")
    assert title == 'What is &lt;markdown&gt;?'  # stored as in the dump; decoded by the site
    assert selftext == 'Line one\n\n**bold** text,\ta tab and a NUL char &amp;gt; quoted'
    assert (score, created) == (300, 1134259200)
    assert one(db, "SELECT title FROM rs_2006_01 WHERE id = 'c002'")[0] == 'Title with\ta tab and\nnewline'


def test_comment_controversiality_stored_as_a_number(db):
    db.execute("SELECT id, controversiality FROM rc_2005_12 WHERE id IN ('k001', 'k005') ORDER BY id")
    assert db.fetchall() == [('k001', 0), ('k005', 1)]


def test_string_numbers_converted(db):
    assert one(db, "SELECT score, created_utc FROM rs_2005_12 WHERE id = 'b004'") == (150, 1134000000)


def test_booleans_stored_as_text(db):
    assert one(db, "SELECT over_18, spoiler, is_self FROM rs_2005_12 WHERE id = 'b003'") == ('True', 'True', 'False')


def test_post_id_ranges(db):
    db.execute('SELECT table_name, id_min, id_max FROM post_id_ranges ORDER BY id_min')
    rows = db.fetchall()
    assert [r[0] for r in rows] == [f'rs_{m}' for m in MONTHS]
    for (_, _, prev_max), (_, next_min, _) in zip(rows, rows[1:]):
        assert prev_max < next_min  # fixture months use disjoint id blocks
    assert one(db, "SELECT table_name FROM post_id_ranges WHERE base36_to_bigint('c001') BETWEEN id_min AND id_max")[0] == 'rs_2006_01'


def test_subreddit_monthly(db):
    db.execute("SELECT to_char(month, 'YYYY-MM'), posts FROM subreddit_monthly WHERE subreddit = 'programming' ORDER BY month")
    # named posts + every third filler post
    assert db.fetchall() == [('2005-12', 2 + 13), ('2006-01', 1 + 10), ('2006-02', 1 + 3)]


def test_top_posts(db):
    db.execute("SELECT id FROM top_posts WHERE month = '2005-12-01' ORDER BY score DESC LIMIT 3")
    assert [r[0] for r in db.fetchall()] == ['b001', 'b002', 'b003']
    assert one(db, 'SELECT count(*) FROM top_posts')[0] == 45 + 32 + 11 + 6


def test_feed_rollup_covers_every_month(db):
    assert one(db, "SELECT count(*) FROM feed_rollup WHERE subreddit = ''")[0] == len(MONTHS)
    assert one(db, "SELECT posts, kept, cardinality(ids) FROM feed_rollup WHERE subreddit = '' AND month = '2005-12-01'") \
        == (45, 1000, 45)
    db.execute("SELECT subreddit, posts FROM feed_rollup WHERE month = '2005-12-01' AND subreddit <> '' ORDER BY 1")
    assert db.fetchall() == [('pics', 1), ('programming', 15), ('reddit.com', 16), ('science', 13)]


def rollup_ids(db, subreddit):
    db.execute("""SELECT array(SELECT base36_to_bigint(x) FROM unnest(%s::text[]) x ORDER BY 1),
                         array(SELECT unnest(ids) ORDER BY 1)
                    FROM feed_rollup WHERE subreddit = %s AND month = '2005-12-01'""", (EXPECTED[subreddit], subreddit))
    return db.fetchone()


# With 2 kept per subreddit and 3 for the front page, the leaders of each sort:
EXPECTED = {
    # Controversial and Most comments: b002 then the highest id among ties at
    # 0 comments (b111); New: b005, b002; Old: the first fillers b101, b104
    'programming': ['b002', 'b111', 'b005', 'b101', 'b104'],
    # Controversial / Most comments: b003, b002, b001; New: b005, b003, b002; Old: b100-b102
    '': ['b001', 'b002', 'b003', 'b005', 'b100', 'b101', 'b102'],
}


def test_feed_rollup_keeps_the_leaders_of_each_sort(db):
    db.execute("CALL refresh_feed_rollup('rs_2005_12', 2, 3)")
    try:
        for subreddit in EXPECTED:
            expected, kept = rollup_ids(db, subreddit)
            assert kept == expected, subreddit
        assert one(db, "SELECT posts, kept FROM feed_rollup WHERE subreddit = 'programming' AND month = '2005-12-01'") \
            == (15, 2)
    finally:
        db.execute("CALL refresh_feed_rollup('rs_2005_12')")


def test_subreddits_metadata(db):
    row = one(db, "SELECT entry_count, first_seen, last_seen, post_count FROM subreddits_metadata WHERE name = 'programming'")
    assert row[0] == 3
    assert str(row[1]) == '2005-12-01'
    assert str(row[2]) == '2006-02-28'
    assert row[3] == 15 + 11 + 4


def test_subreddit_about_merges_snapshots(db):
    title, subscribers, icon, banner = one(
        db, "SELECT title, subscribers, icon_url, banner_url FROM subreddit_about WHERE name = 'programming'")
    assert title == 'Programming!'  # newer snapshot wins
    assert subscribers == 200000
    assert icon == 'https://example.com/icon.png?a=1&b=2'  # kept although the newer snapshot dropped it
    assert banner.startswith('data:image/svg+xml')


def test_profile_subreddits_not_loaded(db):
    assert one(db, "SELECT count(*) FROM subreddit_about WHERE lower(name) LIKE 'u\\_%'")[0] == 0


def test_banned_subreddit_kept_with_name_only(db):
    assert one(db, "SELECT title, subscribers FROM subreddit_about WHERE name = 'GoneSub'") == (None, None)


def run_loader(*args):
    env = dict(os.environ, LOADER_WORKERS='2')
    return subprocess.run([sys.executable, os.path.join(ROOT, 'dump_loader.py'), *args],
                          env=env, capture_output=True, text=True, check=True).stdout


def test_rerun_is_a_no_op():
    assert 'submissions: 0 file(s) to load' in run_loader('submissions')


def test_month_reloads_in_place(db):
    db.execute("DELETE FROM loader_state WHERE file = 'RS_2006-02.zst'")
    output = run_loader('submissions')
    assert 'submissions: 1 file(s) to load' in output
    assert one(db, 'SELECT count(*) FROM rs_2006_02')[0] == 11
    assert one(db, "SELECT rows_loaded FROM loader_state WHERE file = 'RS_2006-02.zst'")[0] == 11
    assert one(db, "SELECT count(*) FROM top_posts WHERE month = '2006-02-01'")[0] == 11
