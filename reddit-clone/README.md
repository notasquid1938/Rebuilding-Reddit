# Reddit Rebuilt — web app

A [Next.js](https://nextjs.org/) (Pages Router) site that serves the Pushshift Reddit dumps from PostgreSQL with an interface modelled on Reddit's current design: top bar with community search, left navigation, card feed, community and user pages, threaded comments and a dark mode.

## Running with Docker

```bash
docker compose up -d --build reddit-clone   # app on http://localhost:3001
```

`docker-compose.yml` also defines the Postgres database (`db`) and the ETL container (`loader`), which decompresses the `RS_*.zst` / `RC_*.zst` dumps from `../Data` into monthly `rs_YYYY_MM` / `rc_YYYY_MM` tables.

Environment variables for the app:

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_URL` | `postgres://postgres:postgres@localhost:5432/Reddit-Rebuilt` | Database connection |
| `DATA_DIR` | `../Data` | Archived subreddit icons (`reddit/icons/<name>.png`) and Imgur images (`imgur/images/<id>.<ext>`) |
| `SITE_URL` | `https://redditrebuilt.com` | Absolute URLs in sitemaps and canonical links |

## Database requirements

The loader creates these for new months automatically. For tables loaded by older versions of the loader, run the scripts once:

```bash
# Per-month indexes on id, (author, created_utc) and score; thread pages, user pages and the global Top feed need them
docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt < scripts/build_indexes.sql

# subreddit_monthly + subreddits_metadata: search suggestions, community stats, top communities
docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt < scripts/build_subreddit_metadata.sql
```

Both scripts are idempotent. Re-run the metadata script after loading new months.

## Development

```bash
npm install
POSTGRES_URL=postgres://postgres:postgres@<db-host>:5432/Reddit-Rebuilt npm run dev
```

## Reddit-style URLs

Paths copied from reddit.com work as-is: `/r/<sub>/comments/<id>/<slug>`, `/comments/<id>`, `/u/<name>` and `/user/<name>` are rewritten to the archived thread or user page.
