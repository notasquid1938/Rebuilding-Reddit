"""
Loads subreddit about pages (Arctic Shift subreddits_YYYY-MM.zst dumps) into
the subreddit_about table: title, descriptions, subscriber count, creation
date and icon/banner URLs for every community (user profile u_* subreddits
are skipped).

Dumps are applied oldest first and merged, so newer snapshots win but a value
that later went blank (e.g. the icon of a since-banned subreddit) keeps the
last known value. Each dump file is applied once (tracked in loader_state).

Usage: python3 subreddits_loader.py   (scans DATA_DIR recursively for subreddits_*.zst)
"""
import html
import io
import json
import os
import re
import subprocess

import psycopg2

from dump_loader import connect, wait_for_db, ensure_state_table, completed_files, encode_value

DATA_DIR = os.getenv('DATA_DIR', os.getcwd())
FILE_RE = re.compile(r'^subreddits(_meta_only)?_(\d{4})-(\d{2})\.zst$')
CHUNK_ROWS = 50000

COLUMNS = ['name', 'subreddit_id', 'title', 'public_description', 'description', 'subscribers', 'created_utc',
           'over18', 'subreddit_type', 'icon_url', 'banner_url', 'primary_color', 'key_color', 'retrieved_on']


def clean(value):
    if value is None or value == '' or value == 'None':
        return None
    return str(value)


def to_int(value):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def record_row(record):
    name = clean(record.get('display_name'))
    if not name or name.lower().startswith('u_'):
        return None
    # community_icon is the current icon; icon_img the legacy one
    icon = clean(record.get('community_icon')) or clean(record.get('icon_img'))
    banner = clean(record.get('banner_background_image')) or clean(record.get('banner_img'))
    over18 = clean(record.get('over18'))
    return {
        'name': name,
        'subreddit_id': clean(record.get('id')),
        'title': clean(record.get('title')),
        'public_description': clean(record.get('public_description')),
        'description': clean(record.get('description')),
        'subscribers': to_int(record.get('subscribers')),
        'created_utc': to_int(record.get('created_utc')),
        'over18': None if over18 is None else str(over18).lower() == 'true',
        'subreddit_type': clean(record.get('subreddit_type')),
        'icon_url': html.unescape(icon) if icon else None,
        'banner_url': html.unescape(banner) if banner else None,
        'primary_color': clean(record.get('primary_color')),
        'key_color': clean(record.get('key_color')),
        'retrieved_on': to_int(record.get('retrieved_on')),
    }


def ensure_table(conn):
    with conn, conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS subreddit_about (
                name               text PRIMARY KEY,
                subreddit_id       text,
                title              text,
                public_description text,
                description        text,
                subscribers        bigint,
                created_utc        bigint,
                over18             boolean,
                subreddit_type     text,
                icon_url           text,
                banner_url         text,
                primary_color      text,
                key_color          text,
                retrieved_on       bigint
            );
            CREATE INDEX IF NOT EXISTS subreddit_about_lower_name_idx ON subreddit_about (lower(name));
        """)


def flush(conn, rows):
    if not rows:
        return
    buffer = io.StringIO()
    for row in rows:
        buffer.write('\t'.join(encode_value(row[c], c in ('subscribers', 'created_utc', 'retrieved_on'))
                               if not isinstance(row[c], bool) else ('t' if row[c] else 'f')
                               for c in COLUMNS) + '\n')
    buffer.seek(0)
    with conn.cursor() as cur:
        cur.execute('CREATE TEMP TABLE IF NOT EXISTS about_stage (LIKE subreddit_about) ON COMMIT DELETE ROWS')
        cur.copy_expert(f"COPY about_stage ({', '.join(COLUMNS)}) FROM STDIN", buffer)
        # Newest snapshot wins, but never replace a known value with a blank one
        updates = ', '.join(f'{c} = COALESCE(EXCLUDED.{c}, subreddit_about.{c})' for c in COLUMNS if c != 'name')
        cur.execute(f"""
            INSERT INTO subreddit_about ({', '.join(COLUMNS)})
            SELECT DISTINCT ON (name) {', '.join(COLUMNS)} FROM about_stage ORDER BY name, retrieved_on DESC NULLS LAST
            ON CONFLICT (name) DO UPDATE SET {updates}""")
    conn.commit()


def load(path, filename):
    meta_only = filename.startswith('subreddits_meta_only')
    print(f'[subreddits] loading {filename}', flush=True)
    conn = connect()
    proc = subprocess.Popen(['zstd', '-dcq', '--long=31', '--memory=2048MB', path], stdout=subprocess.PIPE,
                            bufsize=1 << 20)
    rows, total = [], 0
    for line in proc.stdout:
        try:
            record = json.loads(line)
        except ValueError:
            continue
        if meta_only:
            # Subreddits that could no longer be fetched (banned/private): name only
            name = clean(record.get('display_name'))
            row = None if not name or name.lower().startswith('u_') else {
                **{c: None for c in COLUMNS}, 'name': name, 'subreddit_id': clean(record.get('id'))}
        else:
            row = record_row(record)
        if row:
            rows.append(row)
        if len(rows) >= CHUNK_ROWS:
            flush(conn, rows)
            total += len(rows)
            rows = []
    flush(conn, rows)
    total += len(rows)
    if proc.wait() != 0:
        raise RuntimeError(f'zstd failed on {filename}')
    with conn, conn.cursor() as cur:
        cur.execute("""INSERT INTO loader_state (file, table_name, rows_loaded, rows_failed)
                       VALUES (%s, 'subreddit_about', %s, 0) ON CONFLICT (file) DO NOTHING""", (filename, total))
    conn.close()
    print(f'[subreddits] {filename}: {total:,} subreddits', flush=True)


def main():
    wait_for_db()
    ensure_state_table()
    conn = connect()
    ensure_table(conn)
    conn.close()
    done = completed_files()
    found = []
    for root, _, files in os.walk(DATA_DIR):
        for f in files:
            m = FILE_RE.match(f)
            if m and f not in done:
                # Oldest snapshot first; within a month, full records after meta-only ones
                found.append(((m.group(2), m.group(3), m.group(1) is None), os.path.join(root, f), f))
    for _, path, filename in sorted(found):
        load(path, filename)
    with connect() as conn, conn.cursor() as cur:
        cur.execute('ANALYZE subreddit_about')


if __name__ == '__main__':
    main()
