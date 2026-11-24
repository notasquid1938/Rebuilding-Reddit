"""
Runs wayback_threads.py's recovery on the loaded test database, with a stand-in
for the Wayback Machine serving pages from tests/python/wayback_pages.py. Runs
after the supplement tests in tests/run-integration.sh.
"""
import pytest

import wayback_threads as w
from dump_loader import connect
from supplements_loader import Archive
from wayback_pages import BAN_NOTICE, comment, thread_page

pytestmark = pytest.mark.wayback

URL = 'http://www.reddit.com/r/programming/comments/{}/x/'
# c0zz: the fixture post only its comments (m101, m102) were archived for
THREAD = thread_page('c0zz', 'programming', 'Recovered from a saved page', 'kate', '2006-01-07T12:00:00+00:00',
                     self_html='<p>The <strong>post</strong> itself</p>', comments=[
                         comment('m101', 'kate', '2006-01-08T00:00:00+00:00', '<p>Comment on a post no archive has</p>',
                                 score=7, replies=[
                                     comment('m102', 'liam', '2006-01-08T01:00:00+00:00',
                                             '<p>Reply under the missing post</p>', score=3),
                                     comment('m103', 'mona', '2006-01-08T02:00:00+00:00',
                                             '<p>Reply only the saved page has</p>', score=2)]),
                         comment('m104', 'nick', '2006-01-09T00:00:00+00:00', '<p>Top-level reply from the page</p>',
                                 score=4)])


class FakeWayback:
    def __init__(self):
        self.fetched = []
        self.pages = {
            ('20200101000000', URL.format('c0zz')): BAN_NOTICE,  # newest copy: after the ban
            ('20060110000000', URL.format('c0zz')): THREAD,
            ('20200101000000', URL.format('c0zx')): BAN_NOTICE,
            ('20060110000000', URL.format('b001')): THREAD,  # archived already: never fetched
        }

    def thread_captures(self, community):
        assert community == 'programming'
        return w.thread_ids(f'{ts} {url} 200' for ts, url in self.pages)

    def capture(self, timestamp, url):
        self.fetched.append((timestamp, url))
        return self.pages[(timestamp, url)]


@pytest.fixture(scope='module')
def wayback():
    fake = FakeWayback()
    conn = connect()
    with conn.cursor() as cur:
        w.ensure_tables(cur)
    conn.commit()
    w.recover(conn, Archive(conn), fake, 'programming')
    conn.close()
    return fake


@pytest.fixture(scope='module')
def db(wayback):
    conn = connect()
    conn.autocommit = True
    yield conn.cursor()
    conn.close()


def one(cur, query, params=None):
    cur.execute(query, params)
    return cur.fetchone()


def test_fetches_only_missing_posts_falling_back_to_older_copies(wayback):
    assert sorted(wayback.fetched) == sorted([
        ('20200101000000', URL.format('c0zz')), ('20060110000000', URL.format('c0zz')),
        ('20200101000000', URL.format('c0zx'))])


def test_recovered_post_joins_its_month(db):
    assert one(db, "SELECT title, author, subreddit, selftext FROM rs_2006_01 WHERE id = 'c0zz'") == (
        'Recovered from a saved page', 'kate', 'programming', 'The **post** itself')
    assert one(db, "SELECT source FROM rs_extra WHERE id = 'c0zz'")[0] == 'wayback'
    assert one(db, "SELECT count(*) FROM top_posts WHERE id = 'c0zz'")[0] == 1


def test_adds_only_comments_no_table_has(db):
    db.execute("SELECT id, parent_id, author, body, month FROM rc_extra WHERE link_id = 't3_c0zz' AND source = 'wayback' "
               "ORDER BY id")
    assert [(r[0], r[1], r[2], r[3], str(r[4])) for r in db.fetchall()] == [
        ('m103', 't1_m101', 'mona', 'Reply only the saved page has', '2006-01-01'),
        ('m104', 't3_c0zz', 'nick', 'Top-level reply from the page', '2006-01-01')]
    assert one(db, "SELECT count(*) FROM rc_2006_01 WHERE link_id = 't3_c0zz'")[0] == 2


def test_records_progress(db):
    db.execute('SELECT post_id, status, comments FROM wayback_threads ORDER BY post_id')
    assert db.fetchall() == [('c0zx', 'no usable copy', None), ('c0zz', 'recovered', 2)]
    assert one(db, "SELECT rows_loaded FROM loader_state WHERE file = 'wayback/programming'")[0] == 1


def test_rerun_fetches_nothing(db):
    fake = FakeWayback()
    conn = connect()
    w.recover(conn, Archive(conn), fake, 'programming')
    conn.close()
    assert fake.fetched == []
