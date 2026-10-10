import { getSubmissionTables, timedQuery } from '@/lib/submissions';
import { SITE_URL, SITEMAP_BATCH_SIZE } from '@/lib/site';

function generateSiteMap(ids) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${ids.map((id) => `  <url><loc>${SITE_URL}/Thread/${id}</loc></url>`).join('\n')}
</urlset>
`;
}

function SiteMap() {
  // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res, query }) {
  // Batches look like "2008_01-3": the third block of posts from January 2008
  const match = /^(\d{4})_(\d{2})-(\d{1,5})$/.exec(query.batch || '');
  if (!match) return { notFound: true };

  const [, year, month, batchStr] = match;
  const batch = parseInt(batchStr, 10);
  const tables = await getSubmissionTables();
  const table = tables.find((t) => t.month === `${year}-${month}`);
  if (!table || batch < 1) return { notFound: true };

  try {
    const { rows } = await timedQuery(
      `SELECT id FROM "${table.name}" WHERE id IS NOT NULL ORDER BY id LIMIT $1 OFFSET $2`,
      [SITEMAP_BATCH_SIZE, (batch - 1) * SITEMAP_BATCH_SIZE],
      30000
    );
    if (rows.length === 0) return { notFound: true };

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.write(generateSiteMap(rows.map((row) => encodeURIComponent(row.id))));
    res.end();
  } catch (error) {
    console.error('Error generating sitemap batch:', error.message);
    res.statusCode = 500;
    res.end();
  }

  return { props: {} };
}

export default SiteMap;
