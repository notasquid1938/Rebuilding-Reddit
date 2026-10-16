"""
Writes a miniature archive for the integration tests: monthly RS_/RC_ dumps,
two subreddit snapshots, an icon and a gap-fill corpus, in the same formats as
the real data.

Usage: python3 tests/fixtures/build_fixtures.py <data dir>

The tests (tests/python/test_integration.py, tests/e2e/*) rely on the named
records below; filler posts only pad out feeds and pagination.
"""
import bz2
import json
import os
import subprocess
import sys
import zlib
import struct
from datetime import datetime, timezone


def ts(*args):
    return int(datetime(*args, tzinfo=timezone.utc).timestamp())


def b36(n):
    digits = '0123456789abcdefghijklmnopqrstuvwxyz'
    out = ''
    while True:
        n, r = divmod(n, 36)
        out = digits[r] + out
        if n == 0:
            return out


def post(id, title, subreddit, author, score, created, **extra):
    record = {
        'id': id, 'title': title, 'subreddit': subreddit, 'subreddit_id': f't5_{subreddit.lower()}',
        'author': author, 'score': score, 'created_utc': created, 'num_comments': 0,
        'is_self': False, 'over_18': False, 'spoiler': False, 'stickied': False, 'locked': False,
        'url': f'https://example.com/{id}', 'domain': 'example.com', 'selftext': '',
        'permalink': f'/r/{subreddit}/comments/{id}/', 'thumbnail': 'default', 'edited': False,
    }
    record.update(extra)
    return record


def fillers(prefix, count, created, subreddits=('reddit.com', 'programming', 'science')):
    # Ids stay inside the month's id block (prefix + 3 base-36 digits)
    return [post(f'{prefix}{b36(36 ** 2 + i)}',f'Filler post {prefix}{i}', subreddits[i % len(subreddits)],
                 f'filler_{i % 7}', i + 1, created + i * 60)
            for i in range(count)]


SUBMISSIONS = {
    '2005-12': [
        post('b001', 'Top &amp; best post of December', 'reddit.com', 'alice', 5000, ts(2005, 12, 10),
             num_comments=5, url='https://example.com/article', domain='example.com'),
        post('b002', 'What is &lt;markdown&gt;?', 'programming', 'bob', 300, ts(2005, 12, 11),
             is_self=True, url='https://reddit.com/r/programming/comments/b002/', domain='self.programming',
             selftext='Line one\n\n**bold** text,\ta tab and a NUL\u0000 char &amp;gt; quoted'),
        post('b003', 'NSFW spoiler post', 'pics', 'carol', 200, ts(2005, 12, 12), over_18=True, spoiler=True),
        # Strings where numbers are expected, as in some old dumps
        post('b004', 'Deleted author post', 'reddit.com', '[deleted]', '150', '1134000000.0'),
        post('b005', 'Locked stickied flaired post', 'programming', 'bob', 120, ts(2005, 12, 13),
             locked=True, stickied=True, edited=ts(2005, 12, 14), link_flair_text='Discussion'),
    ] + fillers('b', 40, ts(2005, 12, 1)),
    '2006-01': [
        post('c001', 'January winner', 'programming', 'alice', 4000, ts(2006, 1, 5)),
        post('c002', 'Title with\ta tab and\nnewline', 'science', 'dave', 90, ts(2006, 1, 6)),
    ] + fillers('c', 30, ts(2006, 1, 1)),
    '2006-02': [
        post('d001', 'February programming post', 'programming', 'alice', 100, ts(2006, 2, 3)),
    ] + fillers('d', 10, ts(2006, 2, 1)),
    '2010-06': [
        post('e001', 'History question from 2010', 'AskHistory', 'alice', 777, ts(2010, 6, 15), is_self=True,
             selftext='Why did it happen?'),
    ] + fillers('e', 5, ts(2010, 6, 1), subreddits=('AskHistory',)),
}

# Lines that must be skipped (and counted) by the loader
BAD_LINES = {'2005-12': ['{not json', '[1, 2, 3]']}


def comment(id, parent, body, author, score, created, **extra):
    return {'id': id, 'parent_id': parent, 'link_id': 't3_b001', 'body': body, 'author': author,
            'score': score, 'created_utc': created, 'subreddit': 'reddit.com', 'subreddit_id': 't5_reddit.com',
            'distinguished': None, 'edited': False, 'stickied': False, 'controversiality': 0, **extra}


COMMENTS = {
    '2005-12': [
        comment('k001', 't3_b001', 'First top-level comment', 'carol', 50, ts(2005, 12, 10, 1)),
        comment('k002', 't1_k001', 'Reply from OP', 'alice', 20, ts(2005, 12, 10, 2)),
        comment('k003', 't1_k002', 'Nested reply', 'dave', 5, ts(2005, 12, 10, 3)),
        comment('k004', 't3_b001', '[removed]', '[deleted]', 10, ts(2005, 12, 10, 4)),
        comment('k005', 't3_b001', 'A divisive take', 'frank', 2, ts(2005, 12, 10, 5), controversiality=1),
    ],
    # Comments arrive in later months' dumps too
    '2006-01': [
        comment('m001', 't3_b001', 'Late comment from January', 'erin', 30, ts(2006, 1, 2)),
    ],
}

# Miniature of the 2015 Internet Archive corpus for gapfill_loader.py: two posts
# the monthly dumps already have, recovered posts (one in a month with no table
# yet), a duplicate, an excluded community and lines that can't be used.
GAPFILL_CORPUS = [
    SUBMISSIONS['2005-12'][0],
    SUBMISSIONS['2006-01'][0],
    post('b0aa', 'Recovered December post', 'reddit.com', 'frank', 42, ts(2005, 12, 20)),
    # A nested "id" ahead of the post's own must not be mistaken for it
    {'media': {'oembed': {'id': 'b001'}},
     **post('b0ab', 'Recovered post with media', 'reddit.com', 'frank', 41, ts(2005, 12, 21))},
    post('c0aa', 'Post from a community banned later', 'BannedIn2015', 'gina', 64, '1136505600.0'),
    post('c0aa', 'Post from a community banned later', 'BannedIn2015', 'gina', 64, '1136505600.0'),
    post('d0aa', 'Another banned community post', 'BannedIn2015', 'gina', 32, ts(2006, 2, 4)),
    post('jb01', 'Excluded community post', 'jailbait', 'mallory', 10, ts(2006, 1, 7)),
    post('f0aa', 'Post from a month without a table', 'reddit.com', 'frank', 5, ts(2007, 3, 1)),
]
GAPFILL_BAD_LINES = ['{oops', '{"title": "no id"}']

BANNER = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'

SUBREDDIT_SNAPSHOTS = {
    # Older snapshot: icon present
    'subreddits_2024-01.zst': [
        {'display_name': 'programming', 'id': 'progid', 'title': 'Programming', 'public_description': 'Computer programming',
         'description': '## Rules\n\n1. Be nice', 'subscribers': 100000, 'created_utc': ts(2006, 1, 1),
         'over18': False, 'subreddit_type': 'public', 'community_icon': 'https://example.com/icon.png?a=1&amp;b=2',
         'banner_background_image': BANNER, 'key_color': '#336699', 'retrieved_on': ts(2024, 1, 5)},
        {'display_name': 'pics', 'id': 'picsid', 'title': 'Pictures', 'subscribers': 500, 'over18': False,
         'subreddit_type': 'public', 'retrieved_on': ts(2024, 1, 5)},
        {'display_name': 'u_alice', 'title': 'Profile subreddit', 'subscribers': 1},
        {'display_name': 'GoneSub', 'id': 'goneid', 'title': None, 'subscribers': None},
    ],
    # Newer snapshot: updated counts, icon since removed (must keep the old one)
    'subreddits_2025-01.zst': [
        {'display_name': 'programming', 'id': 'progid', 'title': 'Programming!', 'public_description': 'Computer programming',
         'description': '## Rules\n\n1. Be nice', 'subscribers': 200000, 'created_utc': ts(2006, 1, 1),
         'over18': False, 'subreddit_type': 'public', 'community_icon': '', 'icon_img': '',
         'banner_background_image': BANNER, 'key_color': '#336699', 'retrieved_on': ts(2025, 1, 5)},
    ],
}


def png(width=4, height=4, rgb=(255, 69, 0)):
    raw = b''.join(b'\x00' + bytes(rgb) * width for _ in range(height))

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def write_zst(path, lines):
    data = ''.join(line + '\n' for line in lines).encode('utf-8')
    subprocess.run(['zstd', '-q', '-f', '-o', path], input=data, check=True)


def main(out):
    os.makedirs(out, exist_ok=True)
    for month, records in SUBMISSIONS.items():
        lines = [json.dumps(r) for r in records] + BAD_LINES.get(month, [])
        write_zst(os.path.join(out, f'RS_{month}.zst'), lines)
    for month, records in COMMENTS.items():
        write_zst(os.path.join(out, f'RC_{month}.zst'), [json.dumps(r) for r in records])
    snapshot_dir = os.path.join(out, 'subreddits')
    os.makedirs(snapshot_dir, exist_ok=True)
    for name, records in SUBREDDIT_SNAPSHOTS.items():
        write_zst(os.path.join(snapshot_dir, name), [json.dumps(r) for r in records])
    supplements = os.path.join(out, 'supplements')
    os.makedirs(supplements, exist_ok=True)
    with bz2.open(os.path.join(supplements, 'RS_full_corpus.bz2'), 'wt', encoding='utf-8') as f:
        f.writelines(line + '\n' for line in [json.dumps(r) for r in GAPFILL_CORPUS] + GAPFILL_BAD_LINES)
    icon_dir = os.path.join(out, 'reddit', 'icons')
    os.makedirs(icon_dir, exist_ok=True)
    with open(os.path.join(icon_dir, 'programming.png'), 'wb') as f:
        f.write(png())


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('usage: build_fixtures.py <data dir>')
    main(sys.argv[1])
