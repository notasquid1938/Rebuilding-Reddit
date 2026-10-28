"""
Puts one comment in rc_extra, as wayback_threads.py would, before the website
tests: a reply only a saved page had, under the fixture thread c0zz whose post
no dump has. Usage: python3 tests/fixtures/load_recovered_comments.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import wayback_threads as w  # noqa: E402
from dump_loader import connect, copy_chunk, encode_row  # noqa: E402

COMMENT = {'month': '2006-01-01', 'id': 'm105', 'parent_id': 't1_m101', 'link_id': 't3_c0zz', 'author': 'olga',
           'body': 'Recovered reply from a saved page', 'subreddit': 'programming', 'score': 1,
           'created_utc': 1136700000, 'controversiality': 0}

conn = connect()
with conn.cursor() as cur:
    w.ensure_comment_table(cur)
conn.commit()
copy_chunk(conn, 'rc_extra', w.COMMENT_COLUMNS + ['source'],
           [encode_row(COMMENT, w.COMMENT_COLUMNS, w.COMMENT_NUMERIC)[:-1] + '\tfixture\n'])
conn.close()
