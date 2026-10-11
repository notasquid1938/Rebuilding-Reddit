"""
Downloads subreddit icons into DATA_DIR/reddit/icons/<lowercase name>.<ext>
using the icon URLs recorded in subreddit_about (see subreddits_loader.py).

Append-only: an icon that is already on disk is never replaced or removed, so
an icon scraped while a subreddit still existed stays available after the
subreddit (and its icon) is deleted from Reddit. Failed fetches are recorded
in icon_fetch_attempts and retried after ICON_RETRY_DAYS.

Communities with the most archived posts are fetched first. Only subreddits
that have posts in the archive are considered.

Environment: DATA_DIR, ICON_WORKERS (default 8), ICON_RATE (requests/second,
default 20), ICON_RETRY_DAYS (default 30), ICON_LIMIT (optional cap per run).
"""
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests

from dump_loader import connect, wait_for_db

DATA_DIR = os.getenv('DATA_DIR', os.getcwd())
ICON_DIR = os.path.join(DATA_DIR, 'reddit', 'icons')
WORKERS = int(os.getenv('ICON_WORKERS', '8'))
RATE = float(os.getenv('ICON_RATE', '20'))
RETRY_DAYS = int(os.getenv('ICON_RETRY_DAYS', '30'))
LIMIT = int(os.getenv('ICON_LIMIT', '0')) or None
MAX_BYTES = 2 * 1024 * 1024
EXTENSIONS = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp'}
USER_AGENT = 'RedditRebuilt-icon-archiver/1.0 (+https://github.com/notasquid1938/Rebuilding-Reddit)'


class RateLimiter:
    def __init__(self, per_second):
        self.interval = 1.0 / per_second
        self.lock = threading.Lock()
        self.next_at = time.monotonic()

    def wait(self):
        with self.lock:
            now = time.monotonic()
            delay = self.next_at - now
            self.next_at = max(now, self.next_at) + self.interval
        if delay > 0:
            time.sleep(delay)


def existing_icons():
    names = set()
    for f in os.listdir(ICON_DIR):
        base, _, ext = f.rpartition('.')
        if base and ext in ('png', 'jpg', 'jpeg', 'gif', 'webp'):
            names.add(base.lower())
    return names


def candidates(conn, have):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS icon_fetch_attempts (
                name         text PRIMARY KEY,
                url          text NOT NULL,
                status       text NOT NULL,
                attempted_at timestamptz NOT NULL DEFAULT now()
            )""")
        conn.commit()
        cur.execute("""
            SELECT a.name, a.icon_url
              FROM subreddit_about a
              JOIN subreddits_metadata m ON lower(m.name) = lower(a.name)
              LEFT JOIN icon_fetch_attempts f ON f.name = lower(a.name)
             WHERE a.icon_url LIKE 'http%%'
               AND (f.name IS NULL OR (f.status <> 'ok' AND f.attempted_at < now() - %s * interval '1 day')
                    OR f.url <> a.icon_url)
             ORDER BY m.post_count DESC""", (RETRY_DAYS,))
        # Names differing only in case share one file; keep the busiest community's icon
        rows, seen = [], set(have)
        for name, url in cur.fetchall():
            if name.lower() not in seen:
                seen.add(name.lower())
                rows.append((name, url))
    return rows[:LIMIT] if LIMIT else rows


def fetch(session, limiter, name, url):
    limiter.wait()
    try:
        response = session.get(url, timeout=20, stream=True)
        if response.status_code != 200:
            return name, url, f'http {response.status_code}'
        content_type = response.headers.get('Content-Type', '').split(';')[0].strip().lower()
        ext = EXTENSIONS.get(content_type)
        if not ext:
            return name, url, f'type {content_type or "unknown"}'
        data = response.raw.read(MAX_BYTES + 1, decode_content=True)
        if len(data) > MAX_BYTES or len(data) == 0:
            return name, url, 'size'
        target = os.path.join(ICON_DIR, f'{name.lower()}.{ext}')
        if os.path.exists(target):
            return name, url, 'ok'
        tmp = f'{target}.{threading.get_ident()}.part'
        with open(tmp, 'wb') as f:
            f.write(data)
        os.replace(tmp, target)
        return name, url, 'ok'
    except (requests.RequestException, OSError) as error:
        return name, url, f'error {type(error).__name__}'


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    wait_for_db()
    conn = connect()
    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('subreddit_about') IS NOT NULL AND to_regclass('subreddits_metadata') IS NOT NULL")
        if not cur.fetchone()[0]:
            print('[icons] subreddit_about / subreddits_metadata missing; run subreddits_loader.py first', flush=True)
            return
    todo = candidates(conn, existing_icons())
    print(f'[icons] {len(todo):,} icons to fetch into {ICON_DIR}', flush=True)

    session = requests.Session()
    session.headers['User-Agent'] = USER_AGENT
    adapter = requests.adapters.HTTPAdapter(pool_connections=WORKERS, pool_maxsize=WORKERS)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    limiter = RateLimiter(RATE)
    saved = failed = 0
    pending = []

    def record(results):
        with conn.cursor() as cur:
            cur.executemany("""
                INSERT INTO icon_fetch_attempts (name, url, status) VALUES (lower(%s), %s, %s)
                ON CONFLICT (name) DO UPDATE SET url = EXCLUDED.url, status = EXCLUDED.status, attempted_at = now()""",
                results)
        conn.commit()

    with ThreadPoolExecutor(WORKERS) as pool:
        for i, result in enumerate(pool.map(lambda job: fetch(session, limiter, *job), todo), 1):
            pending.append(result)
            if result[2] == 'ok':
                saved += 1
            else:
                failed += 1
            if len(pending) >= 500:
                record(pending)
                pending = []
            if i % 10000 == 0:
                print(f'[icons] {i:,}/{len(todo):,} processed, {saved:,} saved, {failed:,} unavailable', flush=True)
    record(pending)
    conn.close()
    print(f'[icons] done: {saved:,} saved, {failed:,} unavailable', flush=True)


if __name__ == '__main__':
    main()
