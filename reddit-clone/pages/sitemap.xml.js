import connectToDatabase from '@/db';
import { getSubmissionTables } from '@/lib/submissions';
import { SITE_URL, SITEMAP_BATCH_SIZE } from '@/lib/site';

// Sitemap index: one child sitemap per SITEMAP_BATCH_SIZE posts of each month,
// e.g. /Sitemap/2008_01-1, /Sitemap/2008_01-2, ...
function generateSitemapIndex(batches) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${batches.map((batch) => `  <sitemap><loc>${SITE_URL}/Sitemap/${batch}</loc></sitemap>`).join('\n')}
</sitemapindex>
`;
}

function SiteMap() {
  // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res }) {
  try {
    const tables = await getSubmissionTables();
    const db = await connectToDatabase();
    // Planner row estimates are close enough; a trailing batch may simply be short
    const { rows } = await db.query(
      `SELECT relname, GREATEST(reltuples, 0)::bigint AS estimate FROM pg_class
        WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1)`,
      [tables.map((t) => t.name)]
    );
    const estimates = new Map(rows.map((row) => [row.relname, Number(row.estimate)]));

    const batches = [];
    for (const table of tables) {
      const count = Math.max(1, Math.ceil((estimates.get(table.name) || 0) / SITEMAP_BATCH_SIZE));
      const month = table.month.replace('-', '_');
      for (let i = 1; i <= count; i++) batches.push(`${month}-${i}`);
    }

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.write(generateSitemapIndex(batches));
    res.end();
  } catch (error) {
    console.error('Error generating sitemap index:', error.message);
    res.statusCode = 500;
    res.end();
  }

  return { props: {} };
}

export default SiteMap;
