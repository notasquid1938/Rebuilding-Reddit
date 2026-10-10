# Reddit Rebuilt — web app

A [Next.js](https://nextjs.org/) (Pages Router) site that serves the Pushshift Reddit dumps from PostgreSQL with an interface modelled on Reddit's current design: top bar with community search, left navigation, card feed, community and user pages, threaded comments and a dark mode.

## Running with Docker

```bash
docker compose up -d --build   # site on http://localhost:3001
```

Three services:

- **db**: Postgres. Months loaded by the loader go into the `archive_hdd` tablespace, mounted from `../pg_archive`. Point that mount at whichever disk has room.
- **loader**: keeps the archive complete. Each cycle (every `REFRESH_HOURS`) it:
  1. downloads any monthly dump that is neither on disk nor loaded (`fetch_dumps.py`). The month list is read from [Arctic Shift's download links](https://github.com/ArthurHeitmann/arctic_shift/blob/master/download_links.md), so newly published months are picked up automatically;
  2. loads each `RS_`/`RC_YYYY-MM.zst` into `rs_`/`rc_YYYY_MM` (`dump_loader.py`). It streams from zstd, COPYs into a staging table, isolates bad rows, builds indexes, then swaps the table in, so the site never sees a half-loaded month. Progress lives in the `loader_state` table, so an interrupted run resumes;
  3. refreshes the lookup tables the site reads (`scripts/site_tables.sql`, `scripts/build_subreddit_metadata.sql`);
  4. loads subreddit about pages (title, description, members, icon/banner URLs) from the Arctic Shift subreddit snapshots (`subreddits_loader.py`) and downloads icons into `Data/reddit/icons` (`scrape_icons.py`). Icons are append-only: an icon on disk is never replaced, so communities deleted from Reddit keep theirs.
- **reddit-clone**: the website.

Loader settings (in `docker-compose.yml`):

| Variable | Default | Purpose |
| --- | --- | --- |
| `LOADER_COLUMNS` | `site` | `site` keeps the fields the website shows (about a third of the size); `all` keeps every field |
| `LOAD_COMMENTS` | `0` | Comments add roughly 9 TB (site columns) through 2026. Set to `1` once there's room |
| `DELETE_LOADED_DUMPS` | `comments` | Delete those `.zst` dumps after a load with zero skipped rows |
| `LOADER_WORKERS` | `4` | Months loaded in parallel |
| `LOADER_TABLESPACE` | `archive_hdd` | Tablespace for newly loaded months |
| `REFRESH_HOURS` | `24` | How often to look for newly published months |
| `ICON_RATE` | `20` | Icon downloads per second |

Website settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_URL` | `postgres://postgres:postgres@localhost:5432/Reddit-Rebuilt` | Database connection |
| `DATA_DIR` | `../Data` | Subreddit icons (`reddit/icons/`) and Imgur images (`imgur/images/<id>.<ext>`) |
| `SITE_URL` | `https://redditrebuilt.com` | Absolute URLs in sitemaps and canonical links |

## Database maintenance

The loader creates all indexes and lookup tables itself. For months loaded by older versions of the loader:

```bash
docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt < scripts/build_indexes.sql
cat scripts/site_tables.sql scripts/build_subreddit_metadata.sql | \
  docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt -v ON_ERROR_STOP=1
```

## Development

```bash
npm install
POSTGRES_URL=postgres://postgres:postgres@<db-host>:5432/Reddit-Rebuilt npm run dev
```

## Reddit-style URLs

Paths copied from reddit.com work as-is: `/r/<sub>/comments/<id>/<slug>`, `/comments/<id>`, `/u/<name>` and `/user/<name>` are rewritten to the archived thread or user page.
