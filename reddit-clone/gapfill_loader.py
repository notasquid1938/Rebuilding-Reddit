"""
Fills gaps in the archive from Jason Baumgartner's original "Full Reddit
Submission Corpus (2006 thru August 2015)" on the Internet Archive.

That corpus was crawled in 2014-15, before Pushshift re-collected the same
years, so it still has posts that later vanished from Reddit's API - most
visibly communities banned in 2015, which the monthly dumps cut off at the end
of 2013. Only posts whose id isn't already archived are added; nothing that
the monthly dumps loaded is changed.

- Recovered posts are kept in rs_extra (the source of truth), then merged into
  their rs_YYYY_MM table together with refresh_month() in one transaction per
  month. dump_loader.py re-merges rs_extra whenever it reloads a month, so a
  reload can't drop them.
- Ids are checked against every pre-2016 month (and rs_extra), not only the
  post's own month, so a post filed under another month isn't duplicated.
- Communities in GAPFILL_EXCLUDE are never added.
- Completion is recorded in loader_state; reruns are a no-op. An interrupted
  run resumes: rows already in rs_extra count as archived and merging is
  idempotent.

Usage: python3 gapfill_loader.py [download|load|all]   (default all)
Environment: DATA_DIR, GAPFILL_URL, GAPFILL_SHA256 (empty = skip the check),
GAPFILL_EXCLUDE (comma list, replaces the default), plus the POSTGRES_* variables.
"""
import bz2
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections import Counter
from datetime import datetime, timezone

import numpy as np
import requests
from psycopg2 import sql

from dump_loader import (KINDS, NUMERIC_COLUMNS, connect, copy_chunk, encode_row, ensure_state_table, merge_extra,
                         parse, wait_for_db)

DATA_DIR = os.getenv('DATA_DIR', os.getcwd())
FILENAME = 'RS_full_corpus.bz2'
PATH = os.path.join(DATA_DIR, 'supplements', FILENAME)
# loader_state key; kept apart from the RS_YYYY-MM.zst entries
STATE_KEY = f'gapfill/{FILENAME}'
URL = os.getenv('GAPFILL_URL', 'https://archive.org/download/FullRedditSubmissionCorpus2006ThruAugust2015/'
                + FILENAME)
SHA256 = os.getenv('GAPFILL_SHA256', '91a3547555288ab53649d2115a3850b956bcc99bf3ab2fefeda18c590cc8b276')
# Banned for sexualising minors or sharing non-consensual images
DEFAULT_EXCLUDE = 'jailbait,preteen_girls,creepshots,thefappening,beatingwomen'
EXCLUDE = {s.strip().lower() for s in os.getenv('GAPFILL_EXCLUDE', DEFAULT_EXCLUDE).split(',') if s.strip()}
# The corpus ends in August 2015; check against a little more than that
LAST_MONTH = '2015_12'
COLUMNS = KINDS['submissions']['site_columns']
EXTRA_COLUMNS = ['month'] + COLUMNS
NUMERIC_FLAGS = [c in NUMERIC_COLUMNS for c in EXTRA_COLUMNS]
BATCH = 200000
CHUNK_ROWS = 50000

ID_RE = re.compile(rb'"id":\s*"([0-9a-z]{1,13})"')
TABLE_RE = re.compile(r'^rs_\d{4}_\d{2}$')


# ---------- pieces with no database (unit tested) ----------

def candidate_id(line):
    """The post id from a raw JSON line, or None when it isn't unambiguous
    (no id, or nested objects with their own "id" too) and needs a full parse."""
    found = ID_RE.findall(line)
    return found[0].decode() if len(found) == 1 else None


def month_of(created_utc):
    """'YYYY_MM' (UTC) for a created_utc that may be an int, float or string."""
    try:
        moment = datetime.fromtimestamp(float(created_utc), tz=timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return None
    return moment.strftime('%Y_%m')


def is_excluded(record):
    return str(record.get('subreddit') or '').lower() in EXCLUDE


def to_int(post_id):
    try:
        return int(post_id, 36)
    except (TypeError, ValueError):
        return None


class IdSet:
    """Sorted int64 array: compact membership tests for ~300M ids."""

    def __init__(self, values):
        self.ids = np.unique(np.asarray(values, dtype=np.int64))

    def __len__(self):
        return len(self.ids)

    def contains(self, values):
        values = np.asarray(values, dtype=np.int64)
        if len(self.ids) == 0:
            return np.zeros(len(values), dtype=bool)
        pos = np.searchsorted(self.ids, values)
        pos[pos == len(self.ids)] = 0
        return self.ids[pos] == values


def open_corpus(path):
    """Decompressed lines, using a parallel bzip2 when there is one."""
    tool = shutil.which('lbzip2') or shutil.which('bzip2')
    if not tool:
        with bz2.open(path, 'rb') as f:
            yield from f
        return
    proc = subprocess.Popen([tool, '-dc', path], stdout=subprocess.PIPE, bufsize=1 << 20)
    try:
        yield from proc.stdout
    finally:
        proc.stdout.close()
        if proc.wait() != 0:
            raise RuntimeError(f'{os.path.basename(tool)} exited with {proc.returncode}; corpus may be truncated')


def sha256_of(path):
    digest = hashlib.sha256()
    with open(path, 'rb') as f:
        for block in iter(lambda: f.read(1 << 24), b''):
            digest.update(block)
    return digest.hexdigest()


# ---------- download ----------

def verified(path):
    """Checks the checksum once; a marker file records that it passed."""
    marker = PATH + '.sha256-ok'
    if not SHA256 or os.path.exists(marker):
        return True
    print('[gapfill] verifying checksum', flush=True)
    if sha256_of(path) != SHA256:
        print(f'[gapfill] checksum mismatch; {os.path.basename(path)} discarded', flush=True)
        os.remove(path)
        return False
    open(marker, 'w').close()
    return True


def download():
    if os.path.exists(PATH):
        return verified(PATH)
    os.makedirs(os.path.dirname(PATH), exist_ok=True)
    partial = PATH + '.part'
    for attempt in range(1, 51):
        have = os.path.getsize(partial) if os.path.exists(partial) else 0
        try:
            headers = {'Range': f'bytes={have}-'} if have else {}
            with requests.get(URL, headers=headers, stream=True, timeout=120) as response:
                if response.status_code == 416:
                    break  # already complete
                response.raise_for_status()
                if have and response.status_code != 206:
                    have = 0  # server ignored the range: start over
                with open(partial, 'ab' if have else 'wb') as f:
                    for block in response.iter_content(1 << 20):
                        f.write(block)
            break
        except requests.RequestException as error:
            print(f'[gapfill] download interrupted ({error}); retry {attempt}', flush=True)
            time.sleep(30)
    else:
        return False
    if not verified(partial):
        return False
    os.rename(partial, PATH)
    print(f'[gapfill] downloaded {FILENAME}', flush=True)
    return True


# ---------- loading ----------

def ensure_extra_table(cur):
    cur.execute(sql.SQL('CREATE TABLE IF NOT EXISTS rs_extra ({}, source text NOT NULL)').format(
        sql.SQL(', ').join(sql.SQL('{} {}').format(sql.Identifier(c), sql.SQL(kind)) for c, kind in zip(
            EXTRA_COLUMNS, ['date NOT NULL'] + ['NUMERIC' if n else 'TEXT' for n in NUMERIC_FLAGS[1:]]))))
    cur.execute('CREATE UNIQUE INDEX IF NOT EXISTS rs_extra_id_idx ON rs_extra (id)')
    cur.execute('CREATE INDEX IF NOT EXISTS rs_extra_month_idx ON rs_extra (month)')


def month_tables(cur):
    cur.execute("SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'")
    return sorted(name for (name,) in cur.fetchall() if TABLE_RE.match(name))


def archived_ids(conn, tables):
    """Every id in the pre-2016 months plus rs_extra, read from the id indexes."""
    started = time.time()
    chunks = []
    with conn.cursor() as cur:
        cur.execute('SET enable_seqscan = off')  # the id index is a fraction of the table
        cur.execute('SET enable_bitmapscan = off')
        for table in tables + ['rs_extra']:
            cur.execute(sql.SQL('SELECT id FROM {} WHERE id IS NOT NULL').format(sql.Identifier(table)))
            values = [v for v in (to_int(row[0]) for row in cur.fetchall()) if v is not None]
            chunks.append(np.array(values, dtype=np.int64))
        cur.execute('RESET enable_seqscan')
        cur.execute('RESET enable_bitmapscan')
    conn.commit()
    ids = IdSet(np.concatenate(chunks) if chunks else [])
    print(f'[gapfill] {len(ids):,} archived ids read in {(time.time() - started) / 60:.1f} min', flush=True)
    return ids


def collect(conn, archived, stats):
    """Streams the corpus's posts that the archive lacks into rs_extra."""
    added_ids = set()
    chunk = []

    def flush():
        nonlocal chunk
        failed = copy_chunk(conn, 'rs_extra', EXTRA_COLUMNS + ['source'], chunk)
        stats['failed'] += failed
        stats['added'] += len(chunk) - failed
        chunk = []

    def consider(record):
        post_id = record.get('id')
        value = to_int(post_id) if isinstance(post_id, str) else None
        if value is None:
            stats['unparsable'] += 1
            return
        if archived.contains([value])[0]:
            stats['present'] += 1
            return
        if value in added_ids:
            stats['duplicate'] += 1
            return
        month = month_of(record.get('created_utc'))
        if month is None:
            stats['unparsable'] += 1
            return
        if is_excluded(record):
            stats['excluded'] += 1
            return
        added_ids.add(value)
        record = dict(record, month=f"{month.replace('_', '-')}-01")
        chunk.append(encode_row(record, EXTRA_COLUMNS, NUMERIC_FLAGS)[:-1] + f'\t{FILENAME}\n')
        stats['by_year'][month[:4]] += 1
        stats['by_subreddit'][str(record.get('subreddit'))] += 1
        if len(chunk) >= CHUNK_ROWS:
            flush()

    def check(batch):
        known = archived.contains([value for value, _ in batch])
        for (value, line), present in zip(batch, known):
            if present:
                stats['present'] += 1
                continue
            record = parse(line)
            if record is None:
                stats['unparsable'] += 1
            else:
                consider(record)

    started = time.time()
    batch = []
    for n, line in enumerate(open_corpus(PATH), 1):
        stats['lines'] += 1
        value = to_int(candidate_id(line))
        if value is None:
            record = parse(line)  # ambiguous or missing id: decide on the parsed record
            if record is None:
                stats['unparsable'] += 1
            else:
                consider(record)
        else:
            batch.append((value, line))
            if len(batch) >= BATCH:
                check(batch)
                batch = []
        if n % 10000000 == 0:
            print(f"[gapfill] {n:,} lines, {stats['added'] + len(chunk):,} missing posts found "
                  f'({n / max(1, time.time() - started):,.0f} lines/s)', flush=True)
    check(batch)
    flush()


def already_loaded():
    wait_for_db()
    ensure_state_table()
    conn = connect()
    with conn, conn.cursor() as cur:
        cur.execute('SELECT 1 FROM loader_state WHERE file = %s', (STATE_KEY,))
        done = cur.fetchone() is not None
    conn.close()
    return done


def load():
    if not os.path.exists(PATH) or not verified(PATH):
        print(f'[gapfill] {FILENAME} not downloaded yet', flush=True)
        return False
    conn = connect()
    try:
        with conn.cursor() as cur:
            ensure_extra_table(cur)
            tables = month_tables(cur)
        conn.commit()

        started = time.time()
        print(f'[gapfill] filling gaps from {FILENAME}', flush=True)
        archived = archived_ids(conn, [t for t in tables if t[3:] <= LAST_MONTH])
        stats = {'lines': 0, 'present': 0, 'added': 0, 'duplicate': 0, 'excluded': 0, 'unparsable': 0,
                 'failed': 0, 'by_year': Counter(), 'by_subreddit': Counter()}
        collect(conn, archived, stats)
        del archived

        # Merge every month with recovered posts (also those of an interrupted earlier run)
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT to_char(month, 'YYYY_MM') FROM rs_extra WHERE source = %s ORDER BY 1",
                        (FILENAME,))
            months = [row[0] for row in cur.fetchall()]
        merged = 0
        unmerged = []
        for month in months:
            table = f'rs_{month}'
            if table not in tables:
                unmerged.append(month)  # merged by dump_loader if the month is ever loaded
                continue
            # One transaction per month: its posts and lookup rows change together
            with conn.cursor() as cur:
                added = merge_extra(cur, table)
                if added:
                    cur.execute('CALL refresh_month(%s)', (table,))
            conn.commit()
            merged += added
            if added:
                print(f'[gapfill] {table}: +{added:,} posts', flush=True)

        with conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM rs_extra WHERE source = %s', (FILENAME,))
            total = cur.fetchone()[0]
            cur.execute("""INSERT INTO loader_state (file, table_name, rows_loaded, rows_failed)
                           VALUES (%s, 'rs_extra', %s, %s)
                           ON CONFLICT (file) DO UPDATE SET rows_loaded = EXCLUDED.rows_loaded,
                             rows_failed = EXCLUDED.rows_failed, completed_at = now()""",
                        (STATE_KEY, total, stats['unparsable'] + stats['failed']))
        conn.commit()

        report = {key: value for key, value in stats.items() if not isinstance(value, Counter)}
        report.update(merged=merged, months_without_table=unmerged, minutes=round((time.time() - started) / 60, 1),
                      by_year=dict(sorted(stats['by_year'].items())),
                      top_subreddits=stats['by_subreddit'].most_common(50))
        with open(os.path.join(os.path.dirname(PATH), FILENAME.replace('.bz2', '.report.json')), 'w') as f:
            json.dump(report, f, indent=2)
        print(f"[gapfill] done: {stats['lines']:,} corpus posts, {stats['present']:,} already archived, "
              f"{stats['added']:,} recovered ({merged:,} merged into months), {stats['excluded']:,} excluded, "
              f"{stats['duplicate']:,} duplicates, {stats['unparsable'] + stats['failed']:,} skipped "
              f"in {report['minutes']} min", flush=True)
        return True
    except Exception as error:
        conn.rollback()
        print(f'[gapfill] FAILED: {error}', flush=True)
        return False
    finally:
        conn.close()


def main():
    step = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if step not in ('download', 'load', 'all'):
        sys.exit('usage: gapfill_loader.py [download|load|all]')
    if already_loaded():
        print(f'[gapfill] {FILENAME} already loaded', flush=True)
        return
    ok = True
    if step in ('download', 'all'):
        ok = download()
    if ok and step in ('load', 'all'):
        ok = load()
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
