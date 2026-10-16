"""
Loads Pushshift / Arctic Shift monthly dumps (RS_YYYY-MM.zst submissions,
RC_YYYY-MM.zst comments) into monthly Postgres tables rs_YYYY_MM / rc_YYYY_MM.

- Streams straight out of zstd: nothing is decompressed to disk.
- Columns are the union of keys over a sample of lines plus the columns the
  website needs, so one odd first record can't drop a column.
- Rows are COPYed into <table>_loading; a chunk that fails is bisected so only
  the offending rows are skipped. Indexes are built on the staging table, then
  it is swapped in atomically: the site never sees a half-loaded month.
- Staging tables are UNLOGGED for a fast COPY, then made permanent with
  SET LOGGED (cheap under wal_level=minimal) so a crash can't empty them.
- Completion is recorded in the loader_state table. A file is (re)loaded
  whenever it has no completed entry, so an interrupted run resumes cleanly.
- Posts recovered from supplementary datasets (rs_extra, gapfill_loader.py)
  are merged back into a submissions month whenever it is (re)loaded.

Usage: python3 dump_loader.py submissions|comments
Environment: DATA_DIR (default: current directory), LOADER_WORKERS (default 4;
LOADER_SUBMISSIONS_WORKERS / LOADER_COMMENTS_WORKERS override it per kind),
LOADER_COLUMNS (site = only what the website reads, default; all = every field),
LOADER_TABLESPACE (optional Postgres tablespace for new tables),
DELETE_LOADED_DUMPS (comma list of kinds whose .zst is deleted after a clean
load, e.g. "comments"), LOADER_MIN_FREE_GB (optional: a month is only loaded
if the disk at LOADER_SPACE_PATH, default DATA_DIR, keeps this much free
through the load; months that don't fit wait for a later run), plus the
POSTGRES_* connection variables.
"""
import io
import json
import multiprocessing
import os
import re
import shutil
import subprocess
import sys
import time

import psycopg2
from psycopg2 import sql

DATA_DIR = os.getenv('DATA_DIR', os.getcwd())
WORKERS = max(1, int(os.getenv('LOADER_WORKERS', '4')))
COLUMN_MODE = os.getenv('LOADER_COLUMNS', 'site')
TABLESPACE = os.getenv('LOADER_TABLESPACE', '').strip()
SITE_TABLES_SQL = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scripts', 'site_tables.sql')
DELETE_KINDS = {k.strip() for k in os.getenv('DELETE_LOADED_DUMPS', '').split(',') if k.strip()}
MIN_FREE = float(os.getenv('LOADER_MIN_FREE_GB', '0')) * 1e9
SPACE_PATH = os.getenv('LOADER_SPACE_PATH', DATA_DIR)
SPACE_POLL_SECONDS = 60
SAMPLE_LINES = 50000
CHUNK_ROWS = 100000

NUMERIC_COLUMNS = {'score', 'created_utc', 'ups', 'downs', 'controversiality'}

KINDS = {
    'submissions': {
        'prefix': 'RS',
        'table_prefix': 'rs',
        # Always created; the website reads these
        'site_columns': ['id', 'author', 'subreddit', 'subreddit_id', 'title', 'selftext', 'url', 'domain',
                         'score', 'created_utc', 'num_comments', 'is_self', 'over_18', 'spoiler', 'stickied',
                         'locked', 'link_flair_text', 'thumbnail', 'distinguished', 'edited', 'permalink',
                         'author_flair_text'],
        # Peak disk use while loading, per byte of .zst: SET LOGGED briefly
        # holds two copies of the table (measured ~2.9-3.5x for the final size)
        'peak_space': 5.0,
        'indexes': [
            ('sub_score_idx', '(subreddit, score DESC)'),
            ('id_idx', '(id)'),
            ('author_created_idx', '(author, created_utc DESC)'),
            ('score_idx', '(score DESC)'),
        ],
    },
    'comments': {
        'prefix': 'RC',
        'table_prefix': 'rc',
        'site_columns': ['id', 'parent_id', 'link_id', 'author', 'body', 'subreddit', 'subreddit_id', 'score',
                         'created_utc', 'distinguished', 'edited', 'stickied', 'author_flair_text',
                         'controversiality'],
        'peak_space': 5.0,
        'indexes': [
            ('parent_id_index', '(parent_id)'),
            ('link_id_index', '(link_id)'),
        ],
    },
}

FILE_RE = re.compile(r'^(RS|RC)_(\d{4})-(\d{2})\.zst$')


def connect():
    return psycopg2.connect(
        dbname=os.getenv('POSTGRES_DB', 'Reddit-Rebuilt'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', 'postgres'),
        host=os.getenv('POSTGRES_HOST', 'localhost'),
        port=int(os.getenv('POSTGRES_PORT', '5432')),
    )


def wait_for_db():
    while True:
        try:
            connect().close()
            return
        except psycopg2.OperationalError:
            print('Waiting for database...', flush=True)
            time.sleep(5)


def ensure_state_table():
    conn = connect()
    with conn, conn.cursor() as cur:
        # Several loader processes start together; DDL must not run concurrently
        cur.execute('SELECT pg_advisory_xact_lock(4242001)')
        with open(SITE_TABLES_SQL) as f:
            cur.execute(f.read())
        cur.execute("""
            CREATE TABLE IF NOT EXISTS loader_state (
                file         text PRIMARY KEY,
                table_name   text NOT NULL,
                rows_loaded  bigint NOT NULL,
                rows_failed  bigint NOT NULL,
                completed_at timestamptz NOT NULL DEFAULT now()
            )""")
    conn.close()


def completed_files():
    conn = connect()
    with conn, conn.cursor() as cur:
        cur.execute('SELECT file FROM loader_state')
        done = {row[0] for row in cur.fetchall()}
    conn.close()
    return done


def merge_extra(cur, table):
    """Adds the month's posts recovered from supplementary datasets (rs_extra,
    see gapfill_loader.py) that the table doesn't have. Returns how many."""
    cur.execute("SELECT to_regclass('rs_extra') IS NOT NULL")
    if not cur.fetchone()[0]:
        return 0
    # Months loaded by older versions only have the columns their dump's first
    # line had (rs_2011_01 has no "spoiler"); recovered posts fill those
    cur.execute('SELECT attname FROM pg_attribute WHERE attrelid = %s::regclass AND attnum > 0 AND NOT attisdropped',
                (table,))
    present = {row[0] for row in cur.fetchall()}
    cols = sql.SQL(', ').join(sql.Identifier(c) for c in KINDS['submissions']['site_columns'] if c in present)
    cur.execute(sql.SQL(
        'INSERT INTO {table} ({cols}) SELECT {cols} FROM rs_extra e '
        "WHERE e.month = to_date(%s, 'YYYY_MM') AND NOT EXISTS (SELECT 1 FROM {table} t WHERE t.id = e.id)").format(
            table=sql.Identifier(table), cols=cols), (table[3:],))
    return cur.rowcount


def tablespace_clause():
    return sql.SQL(' TABLESPACE {}').format(sql.Identifier(TABLESPACE)) if TABLESPACE else sql.SQL('')


# ---------- value encoding for COPY text format ----------

_ESCAPES = str.maketrans({'\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r', '\x00': ''})


def encode_value(value, numeric):
    if value is None:
        return '\\N'
    if numeric:
        if isinstance(value, bool):
            return '\\N'
        if isinstance(value, (int, float)):
            return '\\N' if value != value or value in (float('inf'), float('-inf')) else repr(value)
        try:
            number = float(value)
        except (TypeError, ValueError):
            return '\\N'
        return '\\N' if number != number or number in (float('inf'), float('-inf')) else str(value).strip()
    if isinstance(value, bool):
        return 'True' if value else 'False'
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    elif not isinstance(value, str):
        value = str(value)
    return value.translate(_ESCAPES)


def encode_row(record, columns, numeric_flags):
    return '\t'.join(encode_value(record.get(c), n) for c, n in zip(columns, numeric_flags)) + '\n'


# ---------- loading ----------

def open_dump(path):
    return subprocess.Popen(['zstd', '-dcq', '--long=31', '--memory=2048MB', path],
                            stdout=subprocess.PIPE, bufsize=1 << 20)


def parse(line):
    try:
        record = json.loads(line)
    except ValueError:
        try:
            record = json.loads(line.replace(b'\x00', b''))
        except ValueError:
            return None
    return record if isinstance(record, dict) else None


def choose_columns(kind, sample):
    required = KINDS[kind]['site_columns']
    columns = list(required)
    if COLUMN_MODE == 'all':
        seen = set(columns)
        for record in sample:
            for key in record:
                # Keys become identifiers; skip anything pathological
                if key not in seen and len(key) <= 60:
                    seen.add(key)
                    columns.append(key)
    return columns


def copy_chunk(conn, table, columns, rows):
    """COPY rows; on failure bisect to isolate bad rows. Returns rows that failed."""
    if not rows:
        return 0
    statement = sql.SQL('COPY {} ({}) FROM STDIN').format(
        sql.Identifier(table), sql.SQL(', ').join(map(sql.Identifier, columns)))
    try:
        with conn.cursor() as cur:
            cur.copy_expert(statement, io.StringIO(''.join(rows)))
        conn.commit()
        return 0
    except psycopg2.Error:
        conn.rollback()
        if len(rows) == 1:
            return 1
        mid = len(rows) // 2
        return copy_chunk(conn, table, columns, rows[:mid]) + copy_chunk(conn, table, columns, rows[mid:])


# ---------- disk budget (LOADER_MIN_FREE_GB) ----------

_reserved = None  # bytes claimed by loads in progress, shared by the pool's workers
_space_lock = None


def init_worker(reserved, lock):
    global _reserved, _space_lock
    _reserved, _space_lock = reserved, lock


def claim_space(kind, path):
    """Reserves the month's peak disk use. Returns the bytes reserved, or None if
    it can't fit even once every other load in progress has finished."""
    if not MIN_FREE or _reserved is None:
        return 0
    need = KINDS[kind]['peak_space'] * os.path.getsize(path)
    while True:
        with _space_lock:
            free = shutil.disk_usage(SPACE_PATH).free
            # Free space already reflects part of what other loads reserved, so
            # this errs on the side of waiting; it's exact once they're done
            if free - _reserved.value - need >= MIN_FREE:
                _reserved.value += need
                return need
            if _reserved.value == 0:
                return None
        time.sleep(SPACE_POLL_SECONDS)


def release_space(amount):
    if amount:
        with _space_lock:
            _reserved.value -= amount


def load_file(job):
    kind, filename = job
    path = os.path.join(DATA_DIR, filename)
    reserved = claim_space(kind, path)
    if reserved is None:
        print(f'[{filename}] not enough disk space to keep {MIN_FREE / 1e9:.0f} GB free; left for a later run',
              flush=True)
        return filename, None, 'no space'
    try:
        return _load_file(kind, filename)
    finally:
        release_space(reserved)


def _load_file(kind, filename):
    spec = KINDS[kind]
    match = FILE_RE.match(filename)
    table = f"{spec['table_prefix']}_{match.group(2)}_{match.group(3)}"
    staging = f'{table}_loading'
    path = os.path.join(DATA_DIR, filename)
    started = time.time()
    print(f'[{table}] loading {filename}', flush=True)

    conn = connect()
    proc = open_dump(path)
    try:
        lines = iter(proc.stdout)
        sample_lines = []
        for line in lines:
            sample_lines.append(line)
            if len(sample_lines) >= SAMPLE_LINES:
                break
        sample = [r for r in map(parse, sample_lines) if r is not None]
        columns = choose_columns(kind, sample)
        numeric_flags = [c in NUMERIC_COLUMNS for c in columns]

        with conn.cursor() as cur:
            cur.execute(sql.SQL('DROP TABLE IF EXISTS {}').format(sql.Identifier(staging)))
            cur.execute(sql.SQL('CREATE UNLOGGED TABLE {} ({}){}').format(
                sql.Identifier(staging),
                sql.SQL(', ').join(
                    sql.SQL('{} {}').format(sql.Identifier(c), sql.SQL('NUMERIC' if n else 'TEXT'))
                    for c, n in zip(columns, numeric_flags)),
                tablespace_clause()))
        conn.commit()

        loaded = failed = unparsable = 0
        chunk = []

        def records():
            nonlocal unparsable
            for line in sample_lines:
                record = parse(line)
                if record is None:
                    unparsable += 1
                else:
                    yield record
            for line in lines:
                record = parse(line)
                if record is None:
                    unparsable += 1
                else:
                    yield record

        for record in records():
            chunk.append(encode_row(record, columns, numeric_flags))
            if len(chunk) >= CHUNK_ROWS:
                bad = copy_chunk(conn, staging, columns, chunk)
                failed += bad
                loaded += len(chunk) - bad
                chunk = []
                if loaded % 5000000 < CHUNK_ROWS:
                    rate = loaded / max(1, time.time() - started)
                    print(f'[{table}] {loaded:,} rows ({rate:,.0f}/s)', flush=True)
        bad = copy_chunk(conn, staging, columns, chunk)
        failed += bad
        loaded += len(chunk) - bad

        proc.stdout.close()
        if proc.wait() != 0:
            raise RuntimeError(f'zstd exited with {proc.returncode}; dump may be truncated')
        failed += unparsable

        print(f'[{table}] {loaded:,} rows loaded, {failed:,} skipped; indexing', flush=True)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute("SET maintenance_work_mem = '1GB'")
            cur.execute(sql.SQL('ALTER TABLE {} SET LOGGED').format(sql.Identifier(staging)))
            for suffix, cols in spec['indexes']:
                cur.execute(sql.SQL('CREATE INDEX {} ON {} ' + cols + '{}').format(
                    sql.Identifier(f'{staging}_{suffix}'), sql.Identifier(staging), tablespace_clause()))
            cur.execute(sql.SQL('ANALYZE {}').format(sql.Identifier(staging)))
        conn.autocommit = False

        # Swap in atomically and record completion
        with conn.cursor() as cur:
            cur.execute(sql.SQL('DROP TABLE IF EXISTS {} CASCADE').format(sql.Identifier(table)))
            cur.execute(sql.SQL('ALTER TABLE {} RENAME TO {}').format(sql.Identifier(staging), sql.Identifier(table)))
            for suffix, _ in spec['indexes']:
                cur.execute(sql.SQL('ALTER INDEX {} RENAME TO {}').format(
                    sql.Identifier(f'{staging}_{suffix}'), sql.Identifier(f'{table}_{suffix}')))
            if kind == 'submissions':
                recovered = merge_extra(cur, table)
                if recovered:
                    print(f'[{table}] +{recovered:,} recovered posts from rs_extra', flush=True)
            cur.execute("""INSERT INTO loader_state (file, table_name, rows_loaded, rows_failed)
                           VALUES (%s, %s, %s, %s)
                           ON CONFLICT (file) DO UPDATE SET rows_loaded = EXCLUDED.rows_loaded,
                             rows_failed = EXCLUDED.rows_failed, completed_at = now()""",
                        (filename, table, loaded, failed))
        conn.commit()
        # Separate transaction: the swap's exclusive lock shouldn't be held
        # while the month is scanned for its id range, counts and top posts
        if kind == 'submissions':
            with conn.cursor() as cur:
                cur.execute('CALL refresh_month(%s)', (table,))
            conn.commit()

        minutes = (time.time() - started) / 60
        print(f'[{table}] done in {minutes:.1f} min', flush=True)

        if kind in DELETE_KINDS and failed == 0:
            os.remove(path)
            print(f'[{table}] deleted {filename}', flush=True)
        return table, loaded, failed
    except Exception as error:
        conn.rollback()
        print(f'[{table}] FAILED: {error}', flush=True)
        if proc.poll() is None:
            proc.kill()
        return table, None, None
    finally:
        conn.close()


def main():
    if len(sys.argv) != 2 or sys.argv[1] not in KINDS:
        sys.exit('usage: dump_loader.py submissions|comments')
    kind = sys.argv[1]
    wait_for_db()
    ensure_state_table()
    done = completed_files()
    prefix = KINDS[kind]['prefix']
    workers = max(1, int(os.getenv(f'LOADER_{kind.upper()}_WORKERS', WORKERS)))
    pending = sorted(f for f in os.listdir(DATA_DIR)
                     if FILE_RE.match(f) and f.startswith(prefix) and f not in done)
    print(f'{kind}: {len(pending)} file(s) to load with {workers} worker(s), columns={COLUMN_MODE}', flush=True)
    if not pending:
        return
    reserved, lock = multiprocessing.Value('d', 0.0, lock=False), multiprocessing.Lock()
    with multiprocessing.Pool(workers, initializer=init_worker, initargs=(reserved, lock)) as pool:
        results = pool.map(load_file, [(kind, f) for f in pending], chunksize=1)
    no_space = [table for table, loaded, why in results if loaded is None and why == 'no space']
    failures = [table for table, loaded, why in results if loaded is None and why != 'no space']
    if no_space:
        print(f'{kind}: {len(no_space)} file(s) wait for disk space: {no_space[0]} .. {no_space[-1]}', flush=True)
    if failures:
        print(f'{kind}: {len(failures)} file(s) failed and will be retried next run: {", ".join(failures)}', flush=True)
        sys.exit(1)


if __name__ == '__main__':
    main()
