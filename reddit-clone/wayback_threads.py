"""
Recovers posts the dumps lack, with their comments, from the thread pages the
Wayback Machine saved. Communities banned before Pushshift collected them
(r/fatpeoplehate in 2014-15, for example) are often missing from every dump,
but people saved their threads while they were up.

For each community given:
1. The Wayback Machine's index (CDX) lists its saved thread pages
   (reddit.com/r/<community>/comments/<id>/...).
2. Ids the archive already has (a month table or rs_extra) are skipped.
3. For each missing post the newest saved copy is fetched as it was captured
   (the "id_" form, without the Wayback toolbar or rewritten links) and parsed.
   Old Reddit's markup marks every post and comment with its id, author, time,
   score and text; a copy that doesn't parse (a ban notice, the 2018 redesign)
   falls back to the next newest.
4. The post goes into rs_extra (source "wayback"), merged into its month like
   the gap-fill's, and its comments into rc_extra, which the website reads with
   the monthly comment tables. A comment already in a comment table is skipped,
   so nothing archived is ever replaced.

Progress is kept per post in wayback_threads (recovered / no usable copy), so
reruns only fetch what hasn't been tried, and per community in loader_state
("wayback/<community>"). Requests are spaced out and back off when the
Internet Archive is busy.

Usage: python3 wayback_threads.py <community> [<community> ...]
Environment: WAYBACK_INTERVAL (seconds between requests, default 1.5),
LOADER_QUIET_HOURS (merges wait for it), plus the POSTGRES_* variables.
"""
import os
import re
import sys
import time
import urllib.parse
from datetime import datetime
from html.parser import HTMLParser

import requests
from psycopg2 import sql

from dump_loader import KINDS, NUMERIC_COLUMNS, connect, copy_chunk, encode_row, ensure_state_table, wait_for_db
from gapfill_loader import EXTRA_COLUMNS, NUMERIC_FLAGS, ensure_extra_table, month_of
from supplements_loader import Archive, merge_months, record_done

CDX = 'https://web.archive.org/cdx/search/cdx'
CAPTURE = 'https://web.archive.org/web/{timestamp}id_/{url}'
USER_AGENT = 'reddit-rebuilt-recovery/1.0 (archive gap-filling)'
INTERVAL = float(os.getenv('WAYBACK_INTERVAL', '1.5'))
# Saved copies tried per post before giving up on it
MAX_TRIES = 3
SOURCE = 'wayback'

COMMENT_COLUMNS = ['month'] + KINDS['comments']['site_columns']
COMMENT_NUMERIC = [c in NUMERIC_COLUMNS for c in COMMENT_COLUMNS]
THREAD_RE = re.compile(r'/r/([A-Za-z0-9_.]+)/comments/([0-9a-z]{1,10})(?:[/?#]|$)', re.I)
SCORE_RE = re.compile(r'^-?\d+')
COUNT_RE = re.compile(r'(\d[\d,]*)\s+comment')


# ---------- parsing saved pages (no database or network; unit tested) ----------

VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Node:
    __slots__ = ('tag', 'attrs', 'children', 'parent')

    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.children, self.parent = tag, attrs, [], parent

    @property
    def classes(self):
        return set((self.attrs.get('class') or '').split())

    def walk(self, skip=None):
        """Descendant elements depth first, not entering nodes `skip` accepts."""
        for child in self.children:
            if isinstance(child, Node):
                yield child
                if not (skip and skip(child)):
                    yield from child.walk(skip)

    def find(self, test, skip=None):
        return next((n for n in self.walk(skip) if test(n)), None)

    def text(self):
        parts = []
        for child in self.children:
            if isinstance(child, str):
                parts.append(child)
            elif child.tag not in ('script', 'style'):
                parts.append(child.text())
        return ''.join(parts)


class TreeBuilder(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Node('#root', {}, None)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, {k: v or '' for k, v in attrs}, self.current)
        self.current.children.append(node)
        if tag not in VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.current.children.append(Node(tag, {k: v or '' for k, v in attrs}, self.current))

    def handle_endtag(self, tag):
        node = self.current
        while node is not self.root and node.tag != tag:
            node = node.parent
        if node is not self.root:  # a stray end tag is ignored
            self.current = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def parse_html(text):
    builder = TreeBuilder()
    builder.feed(text)
    builder.close()
    return builder.root


def has_class(*names):
    return lambda n: all(name in n.classes for name in names)


def is_thing(node):
    return 'thing' in node.classes and node.attrs.get('data-fullname', '')[:3] in ('t1_', 't3_')


def own(node, test):
    """The first descendant `test` accepts that isn't inside a nested reply."""
    return node.find(test, skip=lambda n: 'child' in n.classes or is_thing(n))


def epoch(value):
    try:
        return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp())
    except (AttributeError, ValueError):
        return None


def first_int(text):
    match = SCORE_RE.match((text or '').strip().replace(',', ''))
    return int(match.group(0)) if match else None


def markdown(node):
    """Reddit's rendered HTML (a div.md) back to the Markdown it was written in."""
    def inline(n):
        out = []
        for child in n.children:
            if isinstance(child, str):
                out.append(child.replace('\n', ' '))
                continue
            inner = inline(child)
            tag = child.tag
            if tag in ('strong', 'b'):
                out.append(f'**{inner}**')
            elif tag in ('em', 'i'):
                out.append(f'*{inner}*')
            elif tag in ('del', 's', 'strike'):
                out.append(f'~~{inner}~~')
            elif tag == 'code':
                out.append(f'`{child.text()}`')
            elif tag == 'sup':
                out.append(f'^({inner})' if ' ' in inner else f'^{inner}')
            elif tag == 'br':
                out.append('  \n')
            elif tag == 'a':
                href = child.attrs.get('href', '')
                out.append(inner if not href or href == inner else f'[{inner}]({href})')
            elif tag in ('script', 'style'):
                continue
            else:
                out.append(inner)
        return ''.join(out)

    def blocks(n):
        out = []
        loose = []

        def flush():
            text = ''.join(loose).strip()
            if text:
                out.append(text)
            loose.clear()

        for child in n.children:
            if isinstance(child, str) or child.tag in ('a', 'strong', 'b', 'em', 'i', 'del', 's', 'strike', 'code',
                                                       'sup', 'br', 'span'):
                loose.append(child.replace('\n', ' ') if isinstance(child, str) else inline(_wrap(child)))
                continue
            flush()
            tag = child.tag
            if tag == 'p':
                out.append(inline(child).strip())
            elif tag in ('h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
                out.append('#' * int(tag[1]) + ' ' + inline(child).strip())
            elif tag == 'blockquote':
                out.append('\n'.join('> ' + line if line else '>' for line in blocks(child).split('\n')))
            elif tag in ('ul', 'ol'):
                items = [c for c in child.children if isinstance(c, Node) and c.tag == 'li']
                lines = []
                for number, item in enumerate(items, 1):
                    marker = f'{number}. ' if tag == 'ol' else '* '
                    body = blocks(item).split('\n')
                    lines.append(marker + body[0])
                    lines.extend('    ' + line if line else '' for line in body[1:])
                out.append('\n'.join(lines))
            elif tag == 'pre':
                out.append('\n'.join('    ' + line for line in child.text().rstrip('\n').split('\n')))
            elif tag == 'hr':
                out.append('* * *')
            elif tag == 'table':
                rows = [r for r in child.walk() if r.tag == 'tr']
                lines = []
                for index, row in enumerate(rows):
                    cells = [inline(c).strip() for c in row.children if isinstance(c, Node) and c.tag in ('td', 'th')]
                    lines.append('|'.join(cells))
                    if index == 0:
                        lines.append('|'.join(':--' for _ in cells))
                out.append('\n'.join(lines))
            elif tag in ('script', 'style'):
                continue
            else:
                out.append(blocks(child))
        flush()
        return '\n\n'.join(b for b in out if b)

    return blocks(node).strip()


def _wrap(child):
    holder = Node('#', {}, None)
    holder.children.append(child)
    return holder


def body_of(node):
    md = own(node, lambda n: 'md' in n.classes and n.parent is not None and 'usertext-body' in n.parent.classes)
    return markdown(md) if md is not None else None


def tagline_of(node):
    return own(node, has_class('tagline'))


def author_of(tagline):
    if tagline is None:
        return None, None
    link = tagline.find(lambda n: n.tag in ('a', 'span') and 'author' in n.classes)
    if link is None:
        return '[deleted]', None
    name = link.text().strip() or '[deleted]'
    distinguished = next((d for d in ('admin', 'moderator') if d in link.classes), None)
    return name, distinguished


def times_of(tagline):
    """(created, edited) from a tagline's <time> elements."""
    if tagline is None:
        return None, None
    created = edited = None
    for node in tagline.walk():
        if node.tag != 'time':
            continue
        if 'edited-timestamp' in node.classes:
            edited = epoch(node.attrs.get('datetime'))
        elif created is None:
            created = epoch(node.attrs.get('datetime'))
    return created, edited


def flair_of(tagline):
    flair = tagline.find(has_class('flair')) if tagline is not None else None
    return (flair.attrs.get('title') or flair.text()).strip() or None if flair is not None else None


def absolute(url):
    if url.startswith('//'):
        return 'https:' + url
    if url.startswith('/'):
        return 'https://www.reddit.com' + url
    return url


def parse_thread(text, post_id, subreddit=None):
    """(post, comments) from a saved old-Reddit thread page, or None when the
    page doesn't show that post (a ban notice, the redesign, an error page).
    Records use the loader's site columns."""
    root = parse_html(text)
    thing = root.find(lambda n: n.attrs.get('data-fullname') == f't3_{post_id}' and 'thing' in n.classes)
    if thing is None:
        return None
    title_link = thing.find(lambda n: n.tag == 'a' and 'title' in n.classes)
    if title_link is None or not title_link.text().strip():
        return None
    page_name = root.find(lambda n: 'redditname' in n.classes)
    if page_name is not None and page_name.text().strip():
        subreddit = page_name.text().strip()
    tagline = tagline_of(thing)
    author, distinguished = author_of(tagline)
    created, edited = times_of(tagline)
    if created is None:
        return None
    classes = thing.classes
    is_self = 'self' in classes
    score_node = own(thing, has_class('score', 'unvoted'))
    score = first_int(score_node.attrs.get('title') or score_node.text()) if score_node is not None else None
    comments_link = own(thing, lambda n: n.tag == 'a' and 'comments' in n.classes)
    count = COUNT_RE.search(comments_link.text()) if comments_link is not None else None
    domain = own(thing, has_class('domain'))
    link_flair = own(thing, has_class('linkflairlabel'))
    thumbnail = own(thing, lambda n: n.tag == 'img' and n.parent is not None and 'thumbnail' in n.parent.classes)
    url = absolute(title_link.attrs.get('href', ''))
    permalink = urllib.parse.urlsplit(comments_link.attrs.get('href', '') if comments_link is not None else url).path
    match = THREAD_RE.search(permalink)
    if not match:
        permalink = urllib.parse.urlsplit(url).path
        match = THREAD_RE.search(permalink)
    if not subreddit and match:
        subreddit = match.group(1)
    selftext = body_of(thing) if is_self else None
    post = {
        'id': post_id,
        'title': title_link.text().strip(),
        'author': author,
        'subreddit': subreddit,
        'created_utc': created,
        'score': score,
        'num_comments': int(count.group(1).replace(',', '')) if count else 0,
        'is_self': is_self,
        'url': url,
        'domain': domain.text().strip().strip('()') if domain is not None else None,
        'selftext': selftext if is_self else '',
        'over_18': 'over18' in classes,
        'spoiler': 'spoiler' in classes,
        'stickied': 'stickied' in classes,
        'locked': 'locked' in classes,
        'link_flair_text': link_flair.text().strip() if link_flair is not None else None,
        'author_flair_text': flair_of(tagline),
        'thumbnail': ('self' if is_self else absolute(thumbnail.attrs.get('src', ''))) if (is_self or thumbnail) else None,
        'distinguished': distinguished,
        'edited': edited or False,
        'permalink': permalink[permalink.index('/r/'):] if match else None,
    }

    comments = []
    area = root.find(has_class('commentarea'))
    for node in (area.walk() if area is not None else []):
        fullname = node.attrs.get('data-fullname', '')
        if not fullname.startswith('t1_') or 'thing' not in node.classes:
            continue
        if node.classes & {'morechildren', 'morerecursion'}:
            continue
        parent = node.parent
        while parent is not None and not is_thing(parent):
            parent = parent.parent
        c_tagline = tagline_of(node)
        c_author, c_distinguished = author_of(c_tagline)
        c_created, c_edited = times_of(c_tagline)
        if c_created is None:
            continue
        c_score = own(node, has_class('score', 'unvoted'))
        body = body_of(node)
        if 'deleted' in node.classes and not body:
            body = '[deleted]'
        comments.append({
            'id': fullname[3:],
            'parent_id': parent.attrs['data-fullname'] if parent is not None else f't3_{post_id}',
            'link_id': f't3_{post_id}',
            'author': c_author,
            'body': body or '',
            'subreddit': subreddit,
            'score': first_int(c_score.attrs.get('title') or c_score.text()) if c_score is not None else None,
            'created_utc': c_created,
            'distinguished': c_distinguished,
            'edited': c_edited or False,
            'stickied': 'stickied' in node.classes,
            'author_flair_text': flair_of(c_tagline),
            'controversiality': 0,
        })
    return post, comments


def thread_ids(lines):
    """{post id: [(timestamp, url), ...] newest first} from CDX lines
    ("timestamp original statuscode")."""
    captures = {}
    for line in lines:
        parts = line.split()
        if len(parts) < 2 or not parts[0].isdigit():
            continue
        match = THREAD_RE.search(parts[1])
        if match:
            captures.setdefault(match.group(2).lower(), set()).add((parts[0], parts[1]))
    return {pid: sorted(found, reverse=True) for pid, found in captures.items()}


def split_resume_key(text):
    """(result lines, resume key or None) from a CDX reply made with
    showResumeKey: when more results remain, the key follows a blank line."""
    lines = text.rstrip('\n').split('\n') if text.strip() else []
    if len(lines) >= 2 and lines[-2] == '' and ' ' not in lines[-1]:
        return lines[:-2], lines[-1]
    return [line for line in lines if line], None


# ---------- network ----------

class Wayback:
    def __init__(self, interval=INTERVAL):
        self.session = requests.Session()
        self.session.headers['User-Agent'] = USER_AGENT
        self.interval = interval
        self.last = 0.0

    def get(self, url, params=None, attempts=8):
        """Text of a page, or None for a 404. Waits out errors with growing pauses."""
        pause = 30
        for attempt in range(attempts):
            wait = self.last + self.interval - time.time()
            if wait > 0:
                time.sleep(wait)
            self.last = time.time()
            try:
                response = self.session.get(url, params=params, timeout=120)
                if response.status_code == 404:
                    return None
                if response.status_code == 200 and 'Temporarily Offline' not in response.text[:2000]:
                    return response.text
                problem = f'HTTP {response.status_code}'
            except requests.RequestException as error:
                problem = str(error)
            print(f'[wayback] {problem}; waiting {pause}s', flush=True)
            time.sleep(pause)
            pause = min(pause * 2, 900)
        raise RuntimeError(f'gave up on {url}')

    def thread_captures(self, community):
        """Every saved copy of the community's thread pages (status 200)."""
        lines, resume = [], None
        while True:
            params = {'url': f'reddit.com/r/{community}/comments/', 'matchType': 'prefix',
                      'fl': 'timestamp,original,statuscode', 'filter': 'statuscode:200',
                      'limit': 20000, 'showResumeKey': 'true'}
            if resume:
                params['resumeKey'] = resume
            chunk, resume = split_resume_key(self.get(CDX, params) or '')
            lines.extend(chunk)
            if not resume:
                return thread_ids(lines)

    def capture(self, timestamp, url):
        return self.get(CAPTURE.format(timestamp=timestamp, url=url), attempts=6)


# ---------- database ----------

def ensure_tables(cur):
    ensure_extra_table(cur)
    ensure_comment_table(cur)
    cur.execute("""CREATE TABLE IF NOT EXISTS wayback_threads (
                     post_id text PRIMARY KEY, subreddit text, status text NOT NULL,
                     capture text, comments integer, tried_at timestamptz NOT NULL DEFAULT now())""")


def ensure_comment_table(cur):
    """rc_extra: recovered comments, read by the website with the monthly tables."""
    cur.execute(sql.SQL('CREATE TABLE IF NOT EXISTS rc_extra ({}, source text NOT NULL)').format(
        sql.SQL(', ').join(sql.SQL('{} {}').format(sql.Identifier(c), sql.SQL(kind)) for c, kind in zip(
            COMMENT_COLUMNS, ['date NOT NULL'] + ['NUMERIC' if n else 'TEXT' for n in COMMENT_NUMERIC[1:]]))))
    cur.execute('CREATE UNIQUE INDEX IF NOT EXISTS rc_extra_id_idx ON rc_extra (id)')
    cur.execute('CREATE INDEX IF NOT EXISTS rc_extra_link_id_idx ON rc_extra (link_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS rc_extra_parent_id_idx ON rc_extra (parent_id)')


def tried(conn, ids):
    with conn.cursor() as cur:
        cur.execute('SELECT post_id FROM wayback_threads WHERE post_id = ANY(%s)', (list(ids),))
        found = {r[0] for r in cur.fetchall()}
    conn.commit()
    return found


def comment_tables(conn, month):
    """The comment tables that can hold a month's posts' comments, plus rc_extra."""
    year, mon = int(month[:4]), int(month[5:7])
    wanted = set()
    for offset in range(7):
        y, m = divmod(mon - 1 + offset, 12)
        wanted.add(f'rc_{year + y}_{m + 1:02d}')
    with conn.cursor() as cur:
        cur.execute("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' "
                    "AND relname = ANY(%s)", (sorted(wanted),))
        tables = sorted(r[0] for r in cur.fetchall())
    conn.commit()
    return tables + ['rc_extra']


def archived_comment_ids(conn, post_id, month):
    found = set()
    with conn.cursor() as cur:
        for table in comment_tables(conn, month):
            cur.execute(sql.SQL('SELECT id FROM {} WHERE link_id = %s').format(sql.Identifier(table)),
                        (f't3_{post_id}',))
            found.update(r[0] for r in cur.fetchall())
    conn.commit()
    return found


def save_thread(conn, post, comments):
    """Adds the post to rs_extra and the comments no table has to rc_extra.
    Returns how many comments were added."""
    month = month_of(post['created_utc'])
    day_one = f"{month.replace('_', '-')}-01"
    copy_chunk(conn, 'rs_extra', EXTRA_COLUMNS + ['source'],
               [encode_row(dict(post, month=day_one), EXTRA_COLUMNS, NUMERIC_FLAGS)[:-1] + f'\t{SOURCE}\n'])
    existing = archived_comment_ids(conn, post['id'], month.replace('_', '-'))
    rows, seen = [], set()
    for comment in comments:
        if comment['id'] in existing or comment['id'] in seen:
            continue
        seen.add(comment['id'])
        c_month = month_of(comment['created_utc']) or month
        rows.append(encode_row(dict(comment, month=f"{c_month.replace('_', '-')}-01"), COMMENT_COLUMNS,
                               COMMENT_NUMERIC)[:-1] + f'\t{SOURCE}\n')
    failed = copy_chunk(conn, 'rc_extra', COMMENT_COLUMNS + ['source'], rows)
    return len(rows) - failed


def record(conn, post_id, subreddit, status, capture=None, comments=None):
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO wayback_threads (post_id, subreddit, status, capture, comments)
                       VALUES (%s, %s, %s, %s, %s)
                       ON CONFLICT (post_id) DO UPDATE SET status = EXCLUDED.status, capture = EXCLUDED.capture,
                         comments = EXCLUDED.comments, tried_at = now()""",
                    (post_id, subreddit, status, capture, comments))
    conn.commit()


# ---------- running ----------

def recover(conn, archive, wayback, community):
    captures = wayback.thread_captures(community)
    ids = sorted(captures)
    present = set()
    for start in range(0, len(ids), 5000):
        present |= archive.present(ids[start:start + 5000])
    todo = [pid for pid in ids if pid not in present]
    done = tried(conn, todo) if todo else set()
    todo = [pid for pid in todo if pid not in done]
    print(f'[wayback] r/{community}: {len(ids):,} threads saved, {len(present):,} already archived, '
          f'{len(done):,} tried before, {len(todo):,} to fetch', flush=True)
    stats = {'added': 0, 'failed': 0, 'comments': 0, 'unusable': 0}
    months = set()
    for number, pid in enumerate(todo, 1):
        result = None
        for timestamp, url in captures[pid][:MAX_TRIES]:
            text = wayback.capture(timestamp, url)
            result = parse_thread(text, pid, community) if text else None
            if result:
                break
        if not result:
            record(conn, pid, community, 'no usable copy')
            stats['unusable'] += 1
            continue
        post, comments = result
        if month_of(post['created_utc']) is None:
            record(conn, pid, community, 'no usable copy')
            stats['unusable'] += 1
            continue
        added = save_thread(conn, post, comments)
        record(conn, pid, post['subreddit'], 'recovered', f'{timestamp} {url}', added)
        months.add(month_of(post['created_utc']))
        stats['added'] += 1
        stats['comments'] += added
        if number % 100 == 0:
            print(f"[wayback] r/{community}: {number:,}/{len(todo):,} fetched, {stats['added']:,} posts and "
                  f"{stats['comments']:,} comments recovered", flush=True)
    merged = merge_months(conn, months)
    record_done(conn, f'wayback/{community}', stats)
    print(f"[wayback] r/{community}: {stats['added']:,} posts ({merged:,} merged into months) and "
          f"{stats['comments']:,} comments recovered; {stats['unusable']:,} without a usable copy", flush=True)


def main():
    communities = sys.argv[1:]
    if not communities:
        sys.exit('usage: wayback_threads.py <community> [<community> ...]')
    wait_for_db()
    ensure_state_table()
    conn = connect()
    with conn.cursor() as cur:
        ensure_tables(cur)
    conn.commit()
    archive = Archive(conn)
    wayback = Wayback()
    for community in communities:
        recover(conn, archive, wayback, community)
    conn.close()


if __name__ == '__main__':
    main()
