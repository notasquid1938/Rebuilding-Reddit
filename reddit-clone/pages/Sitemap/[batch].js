import { batchIds } from '@/lib/sitemap';
import { SITE_URL } from '@/lib/site';

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
  // ("-0" holds the month's posts with ids from before it, see lib/sitemap.js)
  const match = /^(\d{4})_(\d{2})-(\d{1,6})$/.exec(query.batch || '');
  if (!match) return { notFound: true };
  const [, year, month, batchStr] = match;
  const batch = parseInt(batchStr, 10);

  try {
    const ids = await batchIds(`${year}-${month}`, batch);
    if (!ids) return { notFound: true };

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.write(generateSiteMap(ids.map((id) => encodeURIComponent(id))));
    res.end();
  } catch (error) {
    console.error('Error generating sitemap batch:', error.message);
    res.statusCode = 500;
    res.end();
  }

  return { props: {} };
}

export default SiteMap;
