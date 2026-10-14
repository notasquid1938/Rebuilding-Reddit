#!/usr/bin/env bash
# Integration and end-to-end tests: loads tests/fixtures into an empty test
# database with the real loaders, checks the result, then builds and starts the
# website against it and runs the Playwright API and browser tests. Finally
# fills gaps from the fixture corpus (gapfill_loader.py) and checks that.
#
# With POSTGRES_HOST unset a throwaway postgres:15 container is started (needs
# Docker). CI provides its own database. The database name must end in "_test".
#
# Environment: PYTHON (default python3, needs psycopg2 + pytest), APP_PORT
# (default 3123), SKIP_BUILD=1 to reuse an existing .next build, plus any
# Playwright arguments on the command line (e.g. tests/run-integration.sh --headed).
set -euo pipefail
cd "$(dirname "$0")/.."

export POSTGRES_DB="${POSTGRES_DB:-reddit_rebuilt_test}"
export POSTGRES_USER="${POSTGRES_USER:-postgres}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
case "$POSTGRES_DB" in
  *_test) ;;
  *) echo "Refusing to run: POSTGRES_DB ($POSTGRES_DB) must end in _test" >&2; exit 1 ;;
esac
PYTHON="${PYTHON:-python3}"
APP_PORT="${APP_PORT:-3123}"
WORK="$(mktemp -d)"
CONTAINER=""
APP_PID=""

cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null || true
  [ -n "$CONTAINER" ] && docker rm -f "$CONTAINER" > /dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

if [ -z "${POSTGRES_HOST:-}" ]; then
  CONTAINER="reddit-rebuilt-test-db-$$"
  export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT="${POSTGRES_PORT:-55432}"
  echo "Starting test database ($CONTAINER on port $POSTGRES_PORT)"
  docker run -d --rm --name "$CONTAINER" -p "127.0.0.1:$POSTGRES_PORT:5432" \
    -e POSTGRES_DB -e POSTGRES_USER -e POSTGRES_PASSWORD postgres:15-alpine > /dev/null
fi
export POSTGRES_PORT="${POSTGRES_PORT:-5432}"
export PGHOST="$POSTGRES_HOST" PGPORT="$POSTGRES_PORT" PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"

for _ in $(seq 60); do psql -qtAc 'SELECT 1' > /dev/null 2>&1 && break; sleep 1; done
# Start from an empty schema so every run loads the fixtures from scratch
psql -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;' 2> /dev/null

echo "--- Loading fixtures"
export DATA_DIR="$WORK/data"
"$PYTHON" tests/fixtures/build_fixtures.py "$DATA_DIR"
"$PYTHON" dump_loader.py submissions
"$PYTHON" dump_loader.py comments
"$PYTHON" subreddits_loader.py
cat scripts/site_tables.sql scripts/build_subreddit_metadata.sql | psql -q -v ON_ERROR_STOP=1 2>&1 | grep -v NOTICE || true

echo "--- Loader tests"
INTEGRATION=1 "$PYTHON" -m pytest tests/python -q -p no:cacheprovider

echo "--- Building and starting the website"
if [ "${SKIP_BUILD:-0}" != "1" ]; then
  NEXT_TELEMETRY_DISABLED=1 npm run build > "$WORK/build.log" 2>&1 || { cat "$WORK/build.log"; exit 1; }
fi
# Standalone output needs its static assets alongside, as in the Dockerfile
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
POSTGRES_URL="postgres://$POSTGRES_USER:$POSTGRES_PASSWORD@$POSTGRES_HOST:$POSTGRES_PORT/$POSTGRES_DB" \
  PORT="$APP_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production DISABLE_RATE_LIMIT=1 SITE_URL="http://127.0.0.1:$APP_PORT" \
  node .next/standalone/server.js > "$WORK/app.log" 2>&1 &
APP_PID=$!
for _ in $(seq 60); do curl -sf "http://127.0.0.1:$APP_PORT/api/AvailableDates" > /dev/null && break; sleep 1; done

echo "--- Website tests"
BASE_URL="http://127.0.0.1:$APP_PORT" npx playwright test "$@" || { echo "--- App log"; tail -50 "$WORK/app.log"; exit 1; }

# Last: it adds posts the tests above don't expect
echo "--- Gap-fill tests"
INTEGRATION=gapfill "$PYTHON" -m pytest tests/python -q -p no:cacheprovider
