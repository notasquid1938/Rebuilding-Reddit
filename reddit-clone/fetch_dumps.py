"""
Downloads the monthly Reddit dumps (RS_/RC_YYYY-MM.zst) that are neither on
disk nor already loaded, from the Arctic Shift / Watchful1 torrents on Academic
Torrents. Only the needed files inside each torrent are fetched.

The torrent list is read from Arctic Shift's download_links.md, so months
published after this was written are picked up automatically; the list below
is the fallback when GitHub is unreachable.

Files are downloaded under DATA_DIR/.downloads and moved into DATA_DIR only
once complete, so the loader never sees a partial dump.

Environment: DATA_DIR, FETCH_KINDS (comma list of submissions,comments;
default submissions), FETCH_UNTIL (YYYY-MM, optional upper bound).
"""
import os
import re
import shutil
import subprocess
import sys
import urllib.request

import quiet_hours
from dump_loader import connect

DATA_DIR = os.getenv('DATA_DIR', os.getcwd())
DOWNLOAD_DIR = os.path.join(DATA_DIR, '.downloads')
KINDS = {k.strip() for k in os.getenv('FETCH_KINDS', 'submissions').split(',') if k.strip()}
UNTIL = os.getenv('FETCH_UNTIL', '').strip()
LINKS_URL = 'https://raw.githubusercontent.com/ArthurHeitmann/arctic_shift/master/download_links.md'
TORRENT_URL = 'https://academictorrents.com/download/{}.torrent'
TRACKERS = ['https://academictorrents.com/announce.php', 'udp://tracker.opentrackr.org:1337/announce']

# (first month, last month, infohash); single months have first == last
FALLBACK_SOURCES = [
    ('2005-06', '2025-12', '3d426c47c767d40f82c7ef0f47c3acacedd2bf44'),
    ('2005-06', '2024-12', 'ba051999301b109eab37d16f027b3f49ade2de13'),
] + [(m, m, h) for m, h in [
    ('2024-04', 'ad4617a3e9c1f52405197fc088b28a8018e12a7a'), ('2024-05', '4f60634d96d35158842cd58b495dc3b444d78b0d'),
    ('2024-06', 'dcdecc93ca9a9d758c045345112771cef5b4989a'), ('2024-07', '6e5300446bd9b328d0b812cdb3022891e086d9ec'),
    ('2024-08', '8c2d4b00ce8ff9d45e335bed106fe9046c60adb0'), ('2024-09', '43a6e113d6ecacf38e58ecc6caa28d68892dd8af'),
    ('2024-10', '507dfcda29de9936dd77ed4f34c6442dc675c98f'), ('2024-11', 'a1b490117808d9541ab9e3e67a3447e2f4f48f01'),
    ('2024-12', 'eb2017da9f63a49460dde21a4ebe3b7c517f3ad9'), ('2025-01', '4fd14d4c3d792e0b1c5cf6b1d9516c48ba6c4a24'),
    ('2025-02', '2f873e0b15da5ee29b63e586c0ab1dedd3508870'), ('2025-03', '69d5e046e15c02182430879f50d62b18fe1404fb'),
    ('2025-04', '552f34df5b830d18f98b69541e7e84f2658346b9'), ('2025-05', '186a0f85a52ff4f1b08677cd312423ace9b34976'),
    ('2025-06', 'bec5590bd3bc6c0f2d868f36ec92bec1aff4480e'), ('2025-07', 'b6a7ccf72368a7d39c018c423e01bc15aa551122'),
    ('2025-08', 'c71a97c1f7f676c56963c4e15a81f20afb0109be'), ('2025-09', 'a92ce24b4180e4aa9295353f4d26f050031e3058'),
    ('2025-10', 'cb4fa22ea76ea0a2bb38885b27323c94a5d9d16c'), ('2025-11', '2d056b22743718ac81915f25b094b6226668663f'),
    ('2025-12', '481bf2eac43172ae724fd6c75dbcb8e27de77734'), ('2026-01', '8412b89151101d88c915334c45d9c223169a1a60'),
    ('2026-02', 'c5ba00048236b60f819dbf010e9034d24fc291fb'), ('2026-03', '668087bb8c8c9c763b27a1a4c5e7fcb6add25f2c'),
    ('2026-04', '85d017ddd06920534187e7d45f21c7cec90c9bca'), ('2026-05', '55199eff9368cde1f5c1262dd7c1af09f7503ea5'),
    ('2026-06', '3bac8bd352bbb74bbb23df4273cf3da5d66ee5a5'), ('2026-07', 'e04a4fda12826ab1d181eef6512b36aca63c70ff'),
    ('2026-08', 'f4848163a5fb650e4b15eee0202858447bca120a'),
]]

ROW_RE = re.compile(r'^\|\s*(\d{4}-\d{2})(?:\s*-\s*(\d{4}-\d{2}))?\s*\|(.*)$')
HASH_RE = re.compile(r'academictorrents\.com/details/([0-9a-f]{40})')
MAGNET_RE = re.compile(r'^(\d{4}-\d{2}) - (\d{4}-\d{2}) magnet link: `magnet:\?xt=urn:btih:([0-9a-f]{40})')


def load_sources():
    """Current zst torrents from Arctic Shift's download_links.md (built-in list if unreachable)."""
    try:
        with urllib.request.urlopen(LINKS_URL, timeout=30) as response:
            text = response.read().decode('utf-8')
    except OSError as error:
        print(f'[fetch] could not read download links ({error}); using built-in list', flush=True)
        return FALLBACK_SOURCES
    return parse_sources(text) or FALLBACK_SOURCES


def parse_sources(text):
    """(first month, last month, infohash) per zst torrent, skipping superseded (struck-out) rows."""
    sources = []
    for line in text.splitlines():
        magnet = MAGNET_RE.match(line)
        if magnet:
            sources.append(magnet.groups())
            continue
        row = ROW_RE.match(line)
        if not row:
            continue
        zst_cell = row.group(3).split('|')[0]
        match = HASH_RE.search(zst_cell)
        if match and '~~' not in zst_cell:
            first, last = row.group(1), row.group(2) or row.group(1)
            sources.append((first, last, match.group(1)))
    return sources


def month_range(first, last):
    y, m = map(int, first.split('-'))
    while f'{y:04d}-{m:02d}' <= last:
        yield f'{y:04d}-{m:02d}'
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)


def loaded_files():
    try:
        conn = connect()
        with conn.cursor() as cur:
            cur.execute("SELECT to_regclass('loader_state') IS NOT NULL")
            if not cur.fetchone()[0]:
                return set()
            cur.execute('SELECT file FROM loader_state')
            return {row[0] for row in cur.fetchall()}
    except Exception as error:
        print(f'[fetch] database unavailable ({error}); assuming nothing is loaded', flush=True)
        return set()


def torrent_files(infohash, workdir):
    """Return {path inside torrent: index} for a torrent, fetching its metadata first."""
    torrent = os.path.join(workdir, f'{infohash}.torrent')
    if not os.path.exists(torrent):
        try:
            urllib.request.urlretrieve(TORRENT_URL.format(infohash), torrent)
        except OSError:
            # Some bundles are only published as magnet links
            magnet = f'magnet:?xt=urn:btih:{infohash}' + ''.join(f'&tr={t}' for t in TRACKERS)
            subprocess.run(['aria2c', '--bt-metadata-only=true', '--bt-save-metadata=true', '-q',
                            f'--dir={workdir}', magnet], check=True)
            os.replace(os.path.join(workdir, f'{infohash}.torrent'), torrent)
    output = subprocess.run(['aria2c', '--show-files', torrent], capture_output=True, text=True, check=True).stdout
    files = {}
    for line in output.splitlines():
        match = re.match(r'^\s*(\d+)\|(.+)$', line)
        if match:
            files[match.group(2).strip()] = int(match.group(1))
    return torrent, files


def download(infohash, wanted):
    workdir = os.path.join(DOWNLOAD_DIR, infohash)
    os.makedirs(workdir, exist_ok=True)
    torrent, files = torrent_files(infohash, workdir)
    selected = {path: idx for path, idx in files.items() if os.path.basename(path) in wanted}
    if not selected:
        return set()
    print(f'[fetch] {infohash[:8]}: downloading {", ".join(sorted(os.path.basename(p) for p in selected))}',
          flush=True)
    subprocess.run(['aria2c', '--seed-time=0', '--summary-interval=300', '--file-allocation=falloc',
                    '--bt-stop-timeout=3600', '--disable-ipv6=true', f'--dir={workdir}',
                    f'--select-file={",".join(str(i) for i in sorted(selected.values()))}', torrent], check=True)
    fetched = set()
    for path in selected:
        source = os.path.normpath(os.path.join(workdir, path))
        name = os.path.basename(path)
        os.replace(source, os.path.join(DATA_DIR, name))
        fetched.add(name)
    shutil.rmtree(workdir, ignore_errors=True)
    return fetched


def main():
    sources = load_sources()
    latest = max(last for _, last, _ in sources)
    if UNTIL:
        latest = min(latest, UNTIL)
    prefixes = {'submissions': ('RS', '2005-06'), 'comments': ('RC', '2005-12')}
    present = set(os.listdir(DATA_DIR))
    done = loaded_files()
    missing = {}
    for kind in KINDS:
        prefix, first = prefixes[kind]
        for month in month_range(first, latest):
            name = f'{prefix}_{month}.zst'
            if name not in present and name not in done:
                missing[name] = month
    print(f'[fetch] newest available month: {latest}; {len(missing)} file(s) to download', flush=True)

    # Prefer the single-month torrent; fall back to the newest bundle covering the month
    plan = {}
    for name, month in sorted(missing.items()):
        monthly = [h for first, last, h in sources if first == last == month]
        bundles = sorted(((last, h) for first, last, h in sources if first != last and first <= month <= last),
                         reverse=True)
        infohash = monthly[0] if monthly else (bundles[0][1] if bundles else None)
        if infohash:
            plan.setdefault(infohash, set()).add(name)
        else:
            print(f'[fetch] no torrent found for {name}', flush=True)

    failures = 0
    for infohash, wanted in plan.items():
        # Downloads write to the archive disk; give one a couple of hours before quiet hours
        quiet_hours.wait('fetch', 120)
        try:
            got = download(infohash, wanted)
            for name in sorted(wanted - got):
                print(f'[fetch] {name} is not in torrent {infohash[:8]}', flush=True)
        except (subprocess.CalledProcessError, OSError) as error:
            failures += 1
            print(f'[fetch] torrent {infohash[:8]} failed ({error}); will retry next run', flush=True)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
