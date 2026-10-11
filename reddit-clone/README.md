# reddit-clone

The website and data pipeline for Reddit Rebuilt. See the [main README](../README.md) for what the project does, how to run it and how to configure it.

## Code layout

| Path | Purpose |
| --- | --- |
| `pages/` | Next.js (Pages Router) pages: home feed `index.js`, `r/[name].js`, `Thread/[id].js`, `User/[name].js`, sitemaps |
| `pages/api/` | JSON/image endpoints used by the pages (`Posts`, `ID`, `Comments`, `Replies`, `Subreddit`, `SubredditIcons`, `SearchSuggestions`, ...) |
| `components/` | UI: layout shell, feed, post cards, comments, sidebar cards, icons |
| `lib/submissions.js` | All database access: per-month table discovery, column-safe UNION queries and the lookup-table fast paths |
| `styles/` | CSS modules; design tokens (light and dark) live in `globals.css` |
| `dump_loader.py` | Loads monthly `RS_`/`RC_` dumps into Postgres |
| `fetch_dumps.py` | Downloads missing monthly dumps from Academic Torrents |
| `subreddits_loader.py` | Loads subreddit about pages from the subreddit snapshots |
| `scrape_icons.py` | Append-only subreddit icon downloader |
| `entrypoint-loader.sh` | Loader container loop: fetch → load → refresh → subreddits → icons |
| `scripts/` | SQL for indexes and lookup tables (run by the loader; usable by hand) |

## Maintenance scripts

The loader runs these itself. To apply them by hand, for example to months loaded by an older loader version:

```bash
# Per-month indexes on id, (author, created_utc) and score
docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt < scripts/build_indexes.sql

# Lookup tables (id ranges, subreddit months, top posts) and the subreddit search index
cat scripts/site_tables.sql scripts/build_subreddit_metadata.sql | \
  docker exec -i reddit-rebuilt-db psql -U postgres -d Reddit-Rebuilt -v ON_ERROR_STOP=1
```

## Development

```bash
npm install
POSTGRES_URL=postgres://postgres:postgres@<db-host>:5432/Reddit-Rebuilt npm run dev
```
