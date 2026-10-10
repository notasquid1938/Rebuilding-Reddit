#!/bin/bash
set -e

# --- CONFIGURATION ---
TORRENT_URL="https://academictorrents.com/download/ba051999301b109eab37d16f027b3f49ade2de13.torrent"
TORRENT_FILE="reddit_dump.torrent"
TORRENT_COMPLETED_FLAG="torrent_download.complete"
DATA_DIR="/data"

# Ensure the data directory exists
mkdir -p "$DATA_DIR"

# CRITICAL: Switch to the data directory so aria2c downloads here
# and Python scripts check this folder for ZST files.
cd "$DATA_DIR"

echo "Current working directory: $(pwd)"
echo "Checking for data..."

# Check if we have successfully downloaded before
if [ -f "$TORRENT_COMPLETED_FLAG" ]; then
    echo "Torrent download flag found. Skipping download."
else
    # Fallback: Check if ZST files exist
    count=$(ls -1 *.zst 2>/dev/null | wc -l)
    
    if [ "$count" != "0" ]; then
        echo "Found $count .zst files. Skipping download."
        touch "$TORRENT_COMPLETED_FLAG"
    else
        echo "No .zst files found. Starting automated download."
        echo "WARNING: This dataset is ~3.12TB."
        
        wget -O "$TORRENT_FILE" "$TORRENT_URL"
        aria2c --seed-time=0 --summary-interval=60 "$TORRENT_FILE"
        
        echo "Download complete. Flattening directory structure..."
        find . -mindepth 2 -name "*.zst" -exec mv {} . \;
        find . -type d -empty -delete
        
        touch "$TORRENT_COMPLETED_FLAG"
    fi
fi

# --- WAIT FOR DB ---
echo "Waiting for Postgres to be ready..."
while ! nc -z $POSTGRES_HOST 5432; do
  sleep 1
done
echo "Postgres is ready!"

# --- RUN PROCESSING SCRIPTS ---
# Note: We are in /data, but scripts are in /app.
# Python scripts use os.getcwd() (which is now /data) to find files.

echo "--- Starting Submissions Processor ---"
python3 -u /app/process_submissions.py

echo "--- Starting Comments Processor ---"
python3 -u /app/process_comments.py

echo "--- Refreshing subreddit metadata (search suggestions, community stats) ---"
PGPASSWORD="$POSTGRES_PASSWORD" psql -h "$POSTGRES_HOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 -f /app/scripts/build_subreddit_metadata.sql

echo "ETL Complete. Container sleeping."
sleep infinity