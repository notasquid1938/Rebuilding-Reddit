"""
Adds posts the monthly dumps lack from two more public datasets, alongside
the 2015 corpus that gapfill_loader.py handles:

- scrape2013: an independent crawl of Reddit's API from June-July 2013
  (Internet Archive item reddit_json_07-2013: one Posts_YYYY-MM.json.tar.gz of
  Reddit's own JSON per month, Nov 2007 - Jun 2013). Streamed, never stored.
- archives: fan-made archives of communities Reddit later banned, on the
  Internet Archive. Most were made with reddit-html-archiver, whose *-data.zip
  holds a links.csv of posts per day; a few only kept the generated HTML pages,
  which are parsed instead (they record the day, not the time, of a post).

A post is added only if no month table (nor rs_extra) has its id. Ids are
checked through post_id_ranges and each month's id index, a batch at a time,
so memory stays small. New posts go into rs_extra (source "scrape2013" or
"archive:<item>") and are merged into their month together with
refresh_month(), exactly like the gap-fill's. Communities in GAPFILL_EXCLUDE
are never added.

Progress is recorded per file in loader_state ("supplement/scrape2013/<file>",
"supplement/archive/<item>"), so reruns skip finished work and an interrupted
run resumes with the next file.

Files already present under DATA_DIR/supplements/<source>/ are used instead of
downloading them (scrape2013/Posts_YYYY-MM.json.tar.gz, archives/<item>/...).

Usage: python3 supplements_loader.py [scrape2013|archives|all]   (default all)
Environment: DATA_DIR, GAPFILL_EXCLUDE, SUPPLEMENT_SCRAPE_MONTHS and
SUPPLEMENT_ARCHIVE_ITEMS (comma lists replacing the defaults), plus the
POSTGRES_* variables.
"""
import csv
import html
import io
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import zipfile
from collections import Counter
from datetime import datetime, timezone

import numpy as np
import requests
from psycopg2 import sql

from dump_loader import KINDS, connect, copy_chunk, encode_row, ensure_state_table, merge_extra, wait_for_db
from gapfill_loader import EXCLUDE, EXTRA_COLUMNS, NUMERIC_FLAGS, ensure_extra_table, month_of

DATA_DIR = os.getenv('DATA_DIR', os.getcwd())
LOCAL_DIR = os.path.join(DATA_DIR, 'supplements')
IA = 'https://archive.org'
SCRAPE_ITEM = 'reddit_json_07-2013'
SCRAPE_MONTHS = [f'{y}-{m:02d}' for y in range(2007, 2014) for m in range(1, 13)
                 if (2007, 11) <= (y, m) <= (2013, 6)]
if os.getenv('SUPPLEMENT_SCRAPE_MONTHS'):
    SCRAPE_MONTHS = [m.strip() for m in os.getenv('SUPPLEMENT_SCRAPE_MONTHS').split(',') if m.strip()]
COLUMNS = KINDS['submissions']['site_columns']
BATCH = 50000

# Internet Archive items that hold posts the dumps don't have (checked October
# 2026); one per community, preferring the copy with the archiver's CSV data
ARCHIVE_ITEMS = [
    'AFwithNJF_subreddit', 'AntiPECollective_subreddit', 'Average_AHS_User-subreddit',
    'BasadoDepartamento_subreddit', 'BasedGenZ_subreddit', 'BasedZoomers_subreddit', 'Coomer_subreddit',
    'DebateFascism_subreddit', 'DeuxRAMA_subreddit', 'ExposingLeftism_subreddit', 'FascistSpergzy_subreddit',
    'GenZ_Politics-subreddit', 'JordieJordan_subreddit', 'JustBeWhite', 'OpenBorders4Israel_subreddit',
    'PissEarthBegins_subreddit', 'RedditHasCancer_subreddit', 'SuperStraight_subreddit',
    'TeamHeckleBerry_subreddit', 'The_Europe-subreddit', 'WeekendGunnit-archive',
    'WingsOfRedemption_BackupSubreddits', 'WingsOfRedemption_subreddit', 'YallCantBehave_subreddit',
    'ZoomerRight_subreddit', 'ZoomerWaffen_subreddit', 'aganistgaymarriage_archive', 'average_redditor-subreddit',
    'clown__world_archive', 'clownworldwar_archive', 'cringeanarchy', 'edgydarkdankmemes_subreddit',
    'eze_subreddit', 'fragilejewishredditor-archive', 'frenworld_subreddit', 'generation_zyklon-subreddit',
    'gentilesunited_archive', 'hedgewik_subreddit', 'honkler_archive', 'ice_poseidon2-archive', 'ipcj_archive',
    'merchantmemes_archive', 'milliondollarextreme_reddit', 'nickernation_archive', 'offensivememes_archive',
    'r-holocaust_archive', 'r-leroy_archive', 'r-stonetoss_archive', 'socioeconomics-archive',
    'subforwhitepeopleonly_archive', 'transrights_subreddit', 'uncensorednews_archive', 'waterniggas_subreddit',
]
if os.getenv('SUPPLEMENT_ARCHIVE_ITEMS'):
    ARCHIVE_ITEMS = [i.strip() for i in os.getenv('SUPPLEMENT_ARCHIVE_ITEMS').split(',') if i.strip()]
# Media, styling and other files that never hold post data
SKIP_FILE = re.compile(r'(uploads|videos|images|css)\.(zip|7z|tar)$|\.(jpe?g|png|gif|mp4|webm|mkv|pdf|torrent|xml'
                       r'|sqlite_meta|txt)$|_meta\.|_files\.', re.I)
DATA_FILE = re.compile(r'\.(zip|csv|json|jsonl|ndjson|db|sqlite3?|tar|tar\.gz|tgz)$', re.I)

ID_RE = re.compile(r'^(?:t3_)?([0-9a-z]{1,12})$')
PERMALINK_SUB = re.compile(r'/r/([A-Za-z0-9_.]+)/comments/')
csv.field_size_limit(1 << 30)


# ---------- normalising records (no database; unit tested) ----------

def post_id(value):
    match = ID_RE.match(str(value or '').strip().lower())
    return match.group(1) if match else None


def normalize(record, subreddit=None):
    """A post dict in the loader's site columns, or None if it isn't a usable post."""
    pid = post_id(record.get('id') or record.get('idstr') or record.get('name'))
    title = record.get('title')
    if not pid or not isinstance(title, str) or not title:
        return None
    post = {c: record[c] for c in COLUMNS if c in record and record[c] not in ('', None)}
    post['id'] = pid
    if not post.get('subreddit'):
        match = PERMALINK_SUB.search(str(record.get('permalink') or ''))
        post['subreddit'] = match.group(1) if match else subreddit
    if month_of(post.get('created_utc')) is None:
        return None
    if 'url' in post and 'domain' not in post:
        post['domain'] = urllib.parse.urlsplit(str(post['url'])).hostname or None
    return post


def is_excluded(post):
    return str(post.get('subreddit') or '').lower() in EXCLUDE


def json_posts(value):
    """Post-like objects (an id and a title) anywhere in parsed JSON."""
    if isinstance(value, dict):
        data = value.get('data') if value.get('kind') == 't3' else None
        if isinstance(data, dict):
            yield data
        elif 'id' in value and 'title' in value:
            yield value
        else:
            for child in value.values():
                if isinstance(child, (dict, list)):
                    yield from json_posts(child)
    elif isinstance(value, list):
        for child in value:
            yield from json_posts(child)


def json_lines(stream):
    """Records from a JSON document or a JSON-lines stream of bytes."""
    data = stream.read()
    try:
        yield from json_posts(json.loads(data))
        return
    except ValueError:
        pass
    for line in data.splitlines():
        try:
            yield from json_posts(json.loads(line))
        except ValueError:
            continue


def csv_posts(text):
    """Rows of a CSV whose header has both an id (or name) and a title column."""
    reader = csv.reader(io.StringIO(text))
    header = [h.strip().lower() for h in next(reader, [])]
    if 'title' not in header or not ({'id', 'name', 'idstr'} & set(header)):
        return
    for row in reader:
        yield dict(zip(header, row))


# reddit-html-archiver post pages: r/<sub>/comments/<id split into letters>/<slug>.html
ARCHIVER_PAGE = re.compile(r'(?:^|/)r/([^/]+)/comments/((?:[0-9a-z]/){4,10})[^/]+\.html?$')
SUBMISSION = re.compile(r'<div class="submission[^"]*" data-id="([0-9a-z]+)">(.*?)(?=<div class="comments"|</main>)', re.S)
TITLE = re.compile(r'<h3 class="title">(?:<a href="([^"]*)">)?(.*?)(?:</a>)?</h3>', re.S)
BYLINE = re.compile(r'<span class="badge badge-primary">(-?\d+)</span>(?:&nbsp;|\s)*(\d{4}-\d{2}-\d{2})'
                    r'(?:\s+by\s+<a class="author"[^>]*>([^<]+)</a>)?')
SELFTEXT = re.compile(r'<div class="md">(.*?)</div>\s*$', re.S)
COMMENT_COUNT = re.compile(r'<h5>(\d+) comments?</h5>')
TAG = re.compile(r'<[^>]+>')


def html_post(path, text):
    """A post from a reddit-html-archiver page. The archiver kept the day of a
    post, not the time, so it is filed at noon UTC that day."""
    page = ARCHIVER_PAGE.search(path.replace('\\', '/'))
    found = SUBMISSION.search(text)
    if not page or not found:
        return None
    pid, body = found.group(1), found.group(2)
    title, byline = TITLE.search(body), BYLINE.search(body)
    if not title or not byline:
        return None
    day = datetime.strptime(byline.group(2), '%Y-%m-%d').replace(hour=12, tzinfo=timezone.utc)
    record = {
        'id': pid,
        'title': html.unescape(TAG.sub('', title.group(2))).strip(),
        'url': html.unescape(title.group(1)) if title.group(1) else None,
        'score': int(byline.group(1)),
        'created_utc': int(day.timestamp()),
        'author': html.unescape(byline.group(3)) if byline.group(3) else '[deleted]',
        'subreddit': page.group(1),
    }
    selftext = SELFTEXT.search(body)
    if selftext:
        record['selftext'] = html.unescape(TAG.sub('', selftext.group(1))).strip()
        record['is_self'] = True
    comments = COMMENT_COUNT.search(text)
    if comments:
        record['num_comments'] = int(comments.group(1))
    return record


def sqlite_posts(path):
    con = sqlite3.connect(f'file:{urllib.parse.quote(path)}?mode=ro&immutable=1', uri=True)
    try:
        for (table,) in con.execute("SELECT name FROM sqlite_master WHERE type = 'table'"):
            columns = [c[1] for c in con.execute(f'PRAGMA table_info("{table}")')]
            lower = [c.lower() for c in columns]
            if 'title' not in lower or not ({'id', 'idstr'} & set(lower)):
                continue
            for row in con.execute(f'SELECT * FROM "{table}"'):
                record = dict(zip(lower, row))
                if record.get('idstr'):
                    record['id'] = record['idstr']
                yield record
    finally:
        con.close()


def directory_posts(root):
    """(record, default subreddit) for every post in an unpacked archive item.
    HTML pages are only used when the item has no structured post data."""
    structured = 0
    pages = []
    for folder, _, files in os.walk(root):
        for name in files:
            path = os.path.join(folder, name)
            rel = os.path.relpath(path, root).replace('\\', '/')
            low = name.lower()
            # The archiver keeps data/<subreddit>/YYYY/MM/DD/links.csv
            parts = rel.split('/')
            default_sub = parts[parts.index('data') + 1] if 'data' in parts[:-1] else None
            try:
                if low.endswith('.csv'):
                    with open(path, encoding='utf-8', errors='replace', newline='') as f:
                        for record in csv_posts(f.read()):
                            structured += 1
                            yield record, default_sub
                elif low.endswith(('.json', '.jsonl', '.ndjson')):
                    with open(path, 'rb') as f:
                        for record in json_lines(f):
                            structured += 1
                            yield record, default_sub
                elif low.endswith(('.db', '.sqlite', '.sqlite3')):
                    for record in sqlite_posts(path):
                        structured += 1
                        yield record, default_sub
                elif low.endswith(('.html', '.htm')) and ARCHIVER_PAGE.search(rel):
                    pages.append(path)
            except (OSError, csv.Error, sqlite3.Error, UnicodeDecodeError) as error:
                print(f'[supplements]   skipped {rel}: {error}', flush=True)
    if structured == 0:
        for path in pages:
            with open(path, encoding='utf-8', errors='replace') as f:
                record = html_post(os.path.relpath(path, root), f.read())
            if record:
                yield record, None


def unpack(path, dest):
    """Extracts an archive into dest (untrusted: only names inside dest are written)."""
    low = path.lower()
    if low.endswith('.zip'):
        with zipfile.ZipFile(path) as z:
            for member in z.infolist():
                target = os.path.realpath(os.path.join(dest, member.filename))
                if target.startswith(os.path.realpath(dest) + os.sep) and not member.is_dir():
                    os.makedirs(os.path.dirname(target), exist_ok=True)
                    with z.open(member) as src, open(target, 'wb') as out:
                        shutil.copyfileobj(src, out)
    elif low.endswith(('.tar', '.tar.gz', '.tgz')):
        with tarfile.open(path) as t:
            t.extractall(dest, filter='data')
    else:
        shutil.copy(path, dest)


# ---------- checking against the archive ----------

class Archive:
    """Which ids the month tables or rs_extra already have."""

    def __init__(self, conn):
        self.conn = conn
        with conn.cursor() as cur:
            cur.execute('SELECT table_name, id_min, id_max FROM post_id_ranges ORDER BY id_min')
            self.ranges = cur.fetchall()
            cur.execute("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'")
            names = {r[0] for r in cur.fetchall()}
        conn.commit()
        self.ranges = [r for r in self.ranges if r[0] in names]
        self.tables = [r[0] for r in self.ranges]
        self.low = np.array([r[1] for r in self.ranges], dtype=np.int64)
        self.high = np.array([r[2] for r in self.ranges], dtype=np.int64)

    def present(self, ids):
        """The subset of ids (base-36 strings) that are already archived."""
        values = np.array([int(pid, 36) for pid in ids], dtype=np.int64)
        # A month's range can overlap others (a few posts carry older ids), so
        # an id is looked up in every month whose range holds it
        inside = (values[:, None] >= self.low) & (values[:, None] <= self.high)
        by_table = {}
        for row, col in zip(*np.nonzero(inside)):
            by_table.setdefault(self.tables[col], []).append(ids[row])
        found = set()
        with self.conn.cursor() as cur:
            for table, batch in list(by_table.items()) + [('rs_extra', list(ids))]:
                cur.execute(sql.SQL('SELECT id FROM {} WHERE id = ANY(%s)').format(sql.Identifier(table)), (batch,))
                found.update(r[0] for r in cur.fetchall())
        self.conn.commit()
        return found


# ---------- loading ----------

def new_stats():
    return {'posts': 0, 'present': 0, 'added': 0, 'duplicate': 0, 'excluded': 0, 'unusable': 0, 'failed': 0,
            'by_month': Counter()}


def add_posts(conn, archive, records, source, stats, seen):
    """Puts the posts the archive lacks into rs_extra. records: (record, default subreddit)."""
    def flush(batch):
        present = archive.present([p['id'] for p in batch])
        rows = []
        for post in batch:
            if post['id'] in present:
                stats['present'] += 1
                continue
            month = month_of(post['created_utc'])
            stats['by_month'][month] += 1
            rows.append(encode_row(dict(post, month=f"{month.replace('_', '-')}-01"), EXTRA_COLUMNS,
                                   NUMERIC_FLAGS)[:-1] + f'\t{source}\n')
        failed = copy_chunk(conn, 'rs_extra', EXTRA_COLUMNS + ['source'], rows)
        stats['failed'] += failed
        stats['added'] += len(rows) - failed

    batch = []
    for record, default_sub in records:
        stats['posts'] += 1
        post = normalize(record, default_sub)
        if post is None:
            stats['unusable'] += 1
            continue
        if post['id'] in seen:
            stats['duplicate'] += 1
            continue
        seen.add(post['id'])
        if is_excluded(post):
            stats['excluded'] += 1
            continue
        batch.append(post)
        if len(batch) >= BATCH:
            flush(batch)
            batch = []
    if batch:
        flush(batch)


def merge_months(conn, months):
    """Merges rs_extra into each month's table and refreshes its lookup rows."""
    merged = 0
    with conn.cursor() as cur:
        cur.execute("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'")
        tables = {r[0] for r in cur.fetchall()}
    conn.commit()
    for month in sorted(months):
        table = f'rs_{month}'
        if table not in tables:
            continue  # stays in rs_extra; dump_loader merges it if the month is ever loaded
        with conn.cursor() as cur:
            added = merge_extra(cur, table)
            if added:
                cur.execute('CALL refresh_month(%s)', (table,))
        conn.commit()
        if added:
            merged += added
            print(f'[supplements] {table}: +{added:,} posts', flush=True)
    return merged


def done_keys(conn, prefix):
    with conn.cursor() as cur:
        cur.execute('SELECT file FROM loader_state WHERE file LIKE %s', (prefix + '%',))
        keys = {r[0] for r in cur.fetchall()}
    conn.commit()
    return keys


def record_done(conn, key, stats):
    with conn.cursor() as cur:
        cur.execute("""INSERT INTO loader_state (file, table_name, rows_loaded, rows_failed)
                       VALUES (%s, 'rs_extra', %s, %s)
                       ON CONFLICT (file) DO UPDATE SET rows_loaded = EXCLUDED.rows_loaded,
                         rows_failed = EXCLUDED.rows_failed, completed_at = now()""",
                    (key, stats['added'], stats['failed']))
    conn.commit()


def fetch(url, retries=5):
    for attempt in range(1, retries + 1):
        try:
            response = requests.get(url, stream=True, timeout=120)
            response.raise_for_status()
            return response
        except requests.RequestException as error:
            print(f'[supplements] {url}: {error}; retry {attempt}', flush=True)
            time.sleep(30)
    raise RuntimeError(f'could not download {url}')


def scrape_records(month):
    """Posts in one month of the 2013 scrape, from a local copy or streamed from the Internet Archive."""
    name = f'Posts_{month}.json.tar.gz'
    local = os.path.join(LOCAL_DIR, 'scrape2013', name)
    if os.path.exists(local):
        archive = tarfile.open(local, mode='r:gz')
    else:
        response = fetch(f'{IA}/download/{SCRAPE_ITEM}/{name}')
        archive = tarfile.open(fileobj=response.raw, mode='r|gz')
    with archive:
        for member in archive:
            stream = archive.extractfile(member) if member.isfile() else None
            if stream is None:
                continue
            for line in stream:
                try:
                    record = json.loads(line)
                except ValueError:
                    continue
                if isinstance(record, dict):
                    yield record, None


def item_files(item):
    """(name, local path or None) for an item's data files."""
    local = os.path.join(LOCAL_DIR, 'archives', item)
    if os.path.isdir(local):
        return [(name, os.path.join(local, name)) for name in sorted(os.listdir(local))]
    response = requests.get(f'{IA}/metadata/{item}/files', timeout=60)
    response.raise_for_status()
    files = [f['name'] for f in response.json().get('result', [])
             if DATA_FILE.search(f['name']) and not SKIP_FILE.search(f['name'])]
    # The archiver's data zip has everything; its HTML zip is only needed without one
    data = [f for f in files if f.lower().endswith('-data.zip')]
    return [(name, None) for name in (data or files)]


def archive_records(item, workdir):
    for name, path in item_files(item):
        if path is None:
            path = os.path.join(workdir, os.path.basename(name))
            with fetch(f'{IA}/download/{item}/{urllib.parse.quote(name)}') as response, open(path, 'wb') as out:
                for block in response.iter_content(1 << 20):
                    out.write(block)
        unpacked = os.path.join(workdir, 'unpacked')
        os.makedirs(unpacked, exist_ok=True)
        unpack(path, unpacked)
    yield from directory_posts(os.path.join(workdir, 'unpacked'))


def run(source):
    wait_for_db()
    ensure_state_table()
    conn = connect()
    with conn.cursor() as cur:
        ensure_extra_table(cur)
    conn.commit()
    archive = Archive(conn)
    seen = set()
    totals = new_stats()

    if source in ('scrape2013', 'all'):
        done = done_keys(conn, 'supplement/scrape2013/')
        for month in SCRAPE_MONTHS:
            key = f'supplement/scrape2013/Posts_{month}.json.tar.gz'
            if key in done:
                continue
            stats = new_stats()
            add_posts(conn, archive, scrape_records(month), 'scrape2013', stats, seen)
            merged = merge_months(conn, stats['by_month'])
            record_done(conn, key, stats)
            print(f"[supplements] scrape2013 {month}: {stats['posts']:,} posts, {stats['added']:,} recovered "
                  f"({merged:,} merged), {stats['excluded']:,} excluded", flush=True)
            totals['added'] += stats['added']

    if source in ('archives', 'all'):
        done = done_keys(conn, 'supplement/archive/')
        for item in ARCHIVE_ITEMS:
            key = f'supplement/archive/{item}'
            if key in done:
                continue
            stats = new_stats()
            workdir = tempfile.mkdtemp(prefix='supplement-', dir=LOCAL_DIR if os.path.isdir(LOCAL_DIR) else None)
            try:
                add_posts(conn, archive, archive_records(item, workdir), f'archive:{item}', stats, seen)
            except (requests.RequestException, RuntimeError, zipfile.BadZipFile, tarfile.TarError) as error:
                print(f'[supplements] {item} failed ({error}); will retry next run', flush=True)
                continue
            finally:
                shutil.rmtree(workdir, ignore_errors=True)
            merged = merge_months(conn, stats['by_month'])
            record_done(conn, key, stats)
            print(f"[supplements] {item}: {stats['posts']:,} posts, {stats['added']:,} recovered ({merged:,} merged)",
                  flush=True)
            totals['added'] += stats['added']

    conn.close()
    print(f"[supplements] done: {totals['added']:,} posts recovered", flush=True)


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if source not in ('scrape2013', 'archives', 'all'):
        sys.exit('usage: supplements_loader.py [scrape2013|archives|all]')
    run(source)


if __name__ == '__main__':
    main()
