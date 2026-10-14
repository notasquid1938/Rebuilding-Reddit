"""
Runs gapfill_loader.py on the loaded test database with the miniature corpus
from tests/fixtures/build_fixtures.py. Runs last in tests/run-integration.sh,
since it adds posts the other tests don't expect.
"""
import json
import os
import subprocess
import sys

import pytest

from dump_loader import connect

pytestmark = pytest.mark.gapfill

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
STATE_KEY = 'gapfill/RS_full_corpus.bz2'


def run(script, *args):
    env = dict(os.environ, LOADER_WORKERS='2', GAPFILL_SHA256='')
    return subprocess.run([sys.executable, os.path.join(ROOT, script), *args],
                          env=env, capture_output=True, text=True, check=True).stdout


@pytest.fixture(scope='module')
def first_run():
    return run('gapfill_loader.py')


@pytest.fixture(scope='module')
def db(first_run):
    conn = connect()
    conn.autocommit = True
    yield conn.cursor()
    conn.close()


def one(cur, query, params=None):
    cur.execute(query, params)
    return cur.fetchone()


def test_report(first_run):
    with open(os.path.join(os.environ['DATA_DIR'], 'supplements', 'RS_full_corpus.report.json')) as f:
        report = json.load(f)
    assert {k: report[k] for k in ('lines', 'present', 'added', 'duplicate', 'excluded', 'unparsable', 'merged')} == {
        'lines': 11, 'present': 2, 'added': 5, 'duplicate': 1, 'excluded': 1, 'unparsable': 2, 'merged': 4}
    assert report['months_without_table'] == ['2007_03']
    assert report['by_year'] == {'2005': 2, '2006': 2, '2007': 1}
    assert '5 recovered (4 merged into months)' in first_run


def test_recovered_posts_join_their_months(db):
    assert one(db, "SELECT title, author, score FROM rs_2005_12 WHERE id = 'b0aa'") == (
        'Recovered December post', 'frank', 42)
    assert one(db, "SELECT title FROM rs_2005_12 WHERE id = 'b0ab'")[0] == 'Recovered post with media'
    assert one(db, "SELECT subreddit, created_utc FROM rs_2006_01 WHERE id = 'c0aa'") == ('BannedIn2015', 1136505600)
    assert one(db, "SELECT count(*) FROM rs_2006_02 WHERE id = 'd0aa'")[0] == 1


def test_archived_posts_are_untouched(db):
    assert one(db, "SELECT count(*) FROM rs_2005_12 WHERE id = 'b001'")[0] == 1
    assert one(db, 'SELECT count(*) FROM rs_2005_12')[0] == 45 + 2
    assert one(db, 'SELECT count(*) FROM rs_2006_01')[0] == 32 + 1
    assert one(db, "SELECT count(*) FROM rs_extra WHERE id IN ('b001', 'c001')")[0] == 0


def test_excluded_community_not_added(db):
    assert one(db, "SELECT count(*) FROM rs_extra WHERE id = 'jb01'")[0] == 0
    assert one(db, "SELECT count(*) FROM subreddit_monthly WHERE subreddit = 'jailbait'")[0] == 0


def test_month_without_a_table_waits_in_rs_extra(db):
    assert one(db, "SELECT to_char(month, 'YYYY-MM') FROM rs_extra WHERE id = 'f0aa'")[0] == '2007-03'
    assert one(db, "SELECT to_regclass('rs_2007_03')")[0] is None


def test_lookup_tables_refreshed(db):
    db.execute("SELECT to_char(month, 'YYYY-MM'), posts FROM subreddit_monthly WHERE subreddit = 'BannedIn2015' ORDER BY 1")
    assert db.fetchall() == [('2006-01', 1), ('2006-02', 1)]
    assert one(db, "SELECT count(*) FROM top_posts WHERE id IN ('b0aa', 'b0ab', 'c0aa', 'd0aa')")[0] == 4
    assert one(db, "SELECT table_name FROM post_id_ranges WHERE base36_to_bigint('c0aa') BETWEEN id_min AND id_max")[0] == 'rs_2006_01'


def test_completion_recorded_and_rerun_is_a_no_op(db):
    assert one(db, 'SELECT table_name, rows_loaded, rows_failed FROM loader_state WHERE file = %s', (STATE_KEY,)) == (
        'rs_extra', 5, 2)
    assert 'already loaded' in run('gapfill_loader.py')
    assert one(db, 'SELECT count(*) FROM rs_2005_12')[0] == 47


def test_reloading_a_month_keeps_recovered_posts(db):
    db.execute("DELETE FROM loader_state WHERE file = 'RS_2006-01.zst'")
    output = run('dump_loader.py', 'submissions')
    assert '[rs_2006_01] +1 recovered posts from rs_extra' in output
    assert one(db, "SELECT count(*) FROM rs_2006_01 WHERE id = 'c0aa'")[0] == 1
    assert one(db, "SELECT posts FROM subreddit_monthly WHERE subreddit = 'BannedIn2015' AND month = '2006-01-01'")[0] == 1
