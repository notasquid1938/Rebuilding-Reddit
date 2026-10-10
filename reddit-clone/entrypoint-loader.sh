#!/bin/bash
# Keeps the archive complete: downloads any missing monthly dumps, loads them,
# refreshes the website's lookup tables, loads subreddit about pages and
# scrapes subreddit icons. Repeats every REFRESH_HOURS so newly published
# months fill in on their own.
set -u

DATA_DIR="${DATA_DIR:-/data}"
SUBREDDIT_DIR="$DATA_DIR/subreddits"
# Arctic Shift subreddit about-page snapshots (icons, descriptions); oldest first
SUBREDDIT_TORRENTS="c902f4b65f0e82a5e37db205c3405f02a028ecdf 5d0bf258a025a5b802572ddc29cde89bf093185c"
export PGPASSWORD="$POSTGRES_PASSWORD"
PSQL=(psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q)

mkdir -p "$DATA_DIR"
cd "$DATA_DIR"

echo "Waiting for Postgres..."
until nc -z "$POSTGRES_HOST" 5432; do sleep 2; done
until "${PSQL[@]}" -c 'SELECT 1' > /dev/null 2>&1; do sleep 2; done
echo "Postgres is ready."

if [ -n "${LOADER_TABLESPACE:-}" ]; then
  exists=$("${PSQL[@]}" -tAc "SELECT 1 FROM pg_tablespace WHERE spcname = '$LOADER_TABLESPACE'")
  if [ "$exists" != "1" ]; then
    echo "Creating tablespace $LOADER_TABLESPACE at $TABLESPACE_LOCATION"
    "${PSQL[@]}" -c "CREATE TABLESPACE $LOADER_TABLESPACE LOCATION '$TABLESPACE_LOCATION'"
    "${PSQL[@]}" -c "ALTER TABLESPACE $LOADER_TABLESPACE SET (random_page_cost = ${TABLESPACE_RANDOM_PAGE_COST:-4})"
  fi
fi

KINDS="submissions"
FETCH_KINDS="submissions"
if [ "${LOAD_COMMENTS:-0}" = "1" ]; then
  KINDS="submissions comments"
  FETCH_KINDS="submissions,comments"
fi
export FETCH_KINDS

fetch_subreddit_dumps() {
  mkdir -p "$SUBREDDIT_DIR"
  for hash in $SUBREDDIT_TORRENTS; do
    [ -f "$SUBREDDIT_DIR/$hash.done" ] && continue
    wget -q -O "$SUBREDDIT_DIR/$hash.torrent" "https://academictorrents.com/download/$hash.torrent" || continue
    # Only the about-page files (skip wikis and rules)
    files=$(aria2c --show-files "$SUBREDDIT_DIR/$hash.torrent" | grep -E '^ *[0-9]+\|.*/subreddits(_meta_only)?_[0-9-]+\.zst' | cut -d'|' -f1 | tr -d ' ' | paste -sd,)
    [ -n "$files" ] || continue
    aria2c --seed-time=0 --summary-interval=300 --disable-ipv6=true --dir="$SUBREDDIT_DIR" \
      --select-file="$files" "$SUBREDDIT_DIR/$hash.torrent" && touch "$SUBREDDIT_DIR/$hash.done"
  done
}

subreddits_and_icons() {
  fetch_subreddit_dumps
  python3 -u /app/subreddits_loader.py
  python3 -u /app/scrape_icons.py
}

run_cycle() {
  echo "=== $(date -u) archive refresh ==="

  # Icons for communities already in the archive don't need to wait for the load
  subreddits_and_icons &
  icons_pid=$!

  python3 -u /app/fetch_dumps.py &
  fetch_pid=$!

  # Load what's on disk while the rest downloads, then load the new arrivals
  for kind in $KINDS; do python3 -u /app/dump_loader.py "$kind"; done
  wait "$fetch_pid"
  for kind in $KINDS; do python3 -u /app/dump_loader.py "$kind"; done

  echo "--- Refreshing site lookup tables ---"
  "${PSQL[@]}" -f /app/scripts/site_tables.sql -f /app/scripts/build_subreddit_metadata.sql

  # Second icon pass covers communities that first appeared in the new months
  wait "$icons_pid"
  python3 -u /app/scrape_icons.py
  echo "=== $(date -u) refresh complete ==="
}

while true; do
  run_cycle
  sleep "${REFRESH_HOURS:-24}h"
done
