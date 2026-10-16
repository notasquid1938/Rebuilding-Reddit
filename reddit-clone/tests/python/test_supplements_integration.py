"""
Runs supplements_loader.py on the loaded test database with the local fixture
copies of the 2013 scrape and two community archives (tests/fixtures). Runs
after the gap-fill tests in tests/run-integration.sh.
"""
import os
import subprocess
import sys

import pytest

from dump_loader import connect

pytestmark = pytest.mark.supplements

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ENV = dict(os.environ, SUPPLEMENT_SCRAPE_MONTHS='2006-01', SUPPLEMENT_ARCHIVE_ITEMS='BannedSub_subreddit,HtmlSub_archive')


def run():
    return subprocess.run([sys.executable, os.path.join(ROOT, 'supplements_loader.py')], env=ENV,
                          capture_output=True, text=True, check=True).stdout


@pytest.fixture(scope='module')
def first_run():
    return run()


@pytest.fixture(scope='module')
def db(first_run):
    conn = connect()
    conn.autocommit = True
    yield conn.cursor()
    conn.close()


def one(cur, query, params=None):
    cur.execute(query, params)
    return cur.fetchone()


def test_reports_what_each_source_added(first_run):
    assert 'scrape2013 2006-01: 3 posts, 1 recovered (1 merged), 1 excluded' in first_run
    assert 'BannedSub_subreddit: 2 posts, 1 recovered (1 merged)' in first_run
    assert 'HtmlSub_archive: 1 posts, 1 recovered (1 merged)' in first_run


def test_recovered_posts_join_their_months(db):
    assert one(db, "SELECT title, author FROM rs_2006_01 WHERE id = 'c0bb'") == ('Recovered by the 2013 scrape', 'harry')
    title, subreddit, selftext = one(db, "SELECT title, subreddit, selftext FROM rs_2006_02 WHERE id = 'd0bb'")
    assert (title, subreddit, selftext) == ('Recovered from a CSV', 'BannedSub', 'Body from the CSV')
    assert one(db, "SELECT title, subreddit, score FROM rs_2006_02 WHERE id = 'd0cc'") == (
        'Recovered from & HTML', 'HtmlSub', 9)
    assert one(db, "SELECT source FROM rs_extra WHERE id = 'd0cc'")[0] == 'archive:HtmlSub_archive'


def test_archived_and_excluded_posts_are_not_added(db):
    assert one(db, "SELECT count(*) FROM rs_2006_01 WHERE id = 'c001'")[0] == 1
    assert one(db, "SELECT count(*) FROM rs_2006_02 WHERE id = 'd001'")[0] == 1
    assert one(db, "SELECT count(*) FROM rs_extra WHERE id = 'jb02'")[0] == 0


def test_lookup_tables_refreshed(db):
    assert one(db, "SELECT count(*) FROM top_posts WHERE id IN ('c0bb', 'd0bb', 'd0cc')")[0] == 3
    assert one(db, "SELECT posts FROM subreddit_monthly WHERE subreddit = 'BannedSub'")[0] == 1


def test_rerun_is_a_no_op(db):
    output = run()
    assert 'scrape2013' not in output.replace('[supplements] done', '')
    assert '0 posts recovered' in output
