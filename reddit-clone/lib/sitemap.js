// Server-side sitemap helpers. Never import this file from client components.
//
// Each month's threads are split into batches of SITEMAP_BATCH_SIZE
// consecutive ids ("2008_01-3" is the third block of January 2008). Reddit ids
// are sequential, so a batch holds at most that many posts and is read with a
// range scan of the month's id index (an OFFSET into a 30M-post month timed out).
// A few posts carry ids from well before their month (rs_2021_05 has 89 below
// April's highest id); numbering starts after the previous month's highest id
// and batch 0 holds those stragglers, instead of thousands of empty batches.
// The index of batches is itself split into pages of SITEMAPS_PER_INDEX, since
// the protocol allows at most 50,000 sitemaps per index file.
import connectToDatabase from '@/db';
import { getSubmissionTables, hasTable, timedQuery } from '@/lib/submissions';
import { SITEMAP_BATCH_SIZE } from '@/lib/site';

export const SITEMAPS_PER_INDEX = 45000;

// table -> { min, max, start }: start is where numbered batches begin
async function idRanges() {
  if (!(await hasTable('post_id_ranges'))) return new Map();
  const db = await connectToDatabase();
  const { rows } = await db.query(
    `SELECT table_name, id_min::text, id_max::text,
            lag(id_max) OVER (ORDER BY month)::text AS prev_max
       FROM post_id_ranges ORDER BY month`
  );
  return new Map(
    rows.map((r) => {
      const [min, max] = [Number(r.id_min), Number(r.id_max)];
      const after = r.prev_max === null ? min : Number(r.prev_max) + 1;
      return [r.table_name, { min, max, start: Math.min(max, Math.max(min, after)) }];
    })
  );
}

// Every batch name, oldest month first
export async function sitemapBatches() {
  const tables = await getSubmissionTables();
  const ranges = await idRanges();
  const db = await connectToDatabase();
  // Months without an id range yet are split by their estimated row count
  const { rows } = await db.query(
    `SELECT relname, GREATEST(reltuples, 0)::bigint AS estimate FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)`,
    [tables.map((t) => t.name)]
  );
  const estimates = new Map(rows.map((row) => [row.relname, Number(row.estimate)]));

  const batches = [];
  for (const table of tables) {
    const range = ranges.get(table.name);
    const size = range ? range.max - range.start + 1 : estimates.get(table.name) || 0;
    const count = Math.max(1, Math.ceil(size / SITEMAP_BATCH_SIZE));
    const month = table.month.replace('-', '_');
    if (range && range.start > range.min) batches.push(`${month}-0`);
    for (let i = 1; i <= count; i++) batches.push(`${month}-${i}`);
  }
  return batches;
}

export const indexPageCount = (batchCount) => Math.max(1, Math.ceil(batchCount / SITEMAPS_PER_INDEX));

// Base-36 bounds of batch `batch` within a month's id range, or null if there
// is no such batch. Ids of one length sort as text in numeric order; a batch
// that spans a change in id length (e.g. 6 -> 7 characters in 2017) is split
// into two ranges.
export function batchBounds(range, batch) {
  const start = range.start ?? range.min;
  let lo;
  let hi;
  if (batch === 0) {
    if (start <= range.min) return null;
    [lo, hi] = [range.min, start - 1];
  } else {
    lo = start + (batch - 1) * SITEMAP_BATCH_SIZE;
    if (batch < 0 || lo > range.max) return null;
    hi = Math.min(range.max, lo + SITEMAP_BATCH_SIZE - 1);
  }
  const [from, to] = [lo.toString(36), hi.toString(36)];
  if (from.length === to.length) return [[from, to]];
  return [
    [from, 'z'.repeat(from.length)],
    ['1' + '0'.repeat(to.length - 1), to],
  ];
}

// Post ids in one batch, or null if there is no such batch
export async function batchIds(month, batch) {
  const table = (await getSubmissionTables()).find((t) => t.month === month);
  if (!table) return null;
  const range = (await idRanges()).get(table.name);

  if (!range) {
    if (batch < 1) return null;
    const { rows } = await timedQuery(
      `SELECT id FROM "${table.name}" WHERE id IS NOT NULL ORDER BY id LIMIT $1 OFFSET $2`,
      [SITEMAP_BATCH_SIZE, (batch - 1) * SITEMAP_BATCH_SIZE],
      30000
    );
    return rows.length ? rows.map((r) => r.id) : null;
  }

  const bounds = batchBounds(range, batch);
  if (!bounds) return null;
  const params = [];
  const clauses = bounds.map(([from, to]) => {
    params.push(from, to, from.length);
    const n = params.length;
    return `(id >= $${n - 2} AND id <= $${n - 1} AND length(id) = $${n})`;
  });
  // The stragglers' span can be wide, so batch 0 is capped at the protocol's limit
  const { rows } = await timedQuery(
    `SELECT id FROM "${table.name}" WHERE ${clauses.join(' OR ')} ORDER BY length(id), id LIMIT 50000`,
    params,
    30000
  );
  return rows.map((r) => r.id);
}
