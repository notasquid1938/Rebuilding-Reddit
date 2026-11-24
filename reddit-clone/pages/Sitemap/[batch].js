import { batchIds, specialSitemapPaths, SPECIAL_SITEMAPS } from '@/lib/sitemap';
import { SITE_URL } from '@/lib/site';

function generateSiteMap(paths) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${SITE_URL}${path}</loc></url>`).join('\n')}
</urlset>
`;
}

function send(res, paths) {
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.write(generateSiteMap(paths));
  res.end();
}

function SiteMap() {
  // getServerSideProps will do the heavy lifting
}

export async function getServerSideProps({ res, query }) {
  if (SPECIAL_SITEMAPS.includes(query.batch)) {
    try {
      send(res, await specialSitemapPaths(query.batch));
    } catch (error) {
      console.error('Error generating sitemap:', error.message);
      res.statusCode = 500;
      res.end();
    }
    return { props: {} };
  }

  // Batches look like "2008_01-3": the third block of posts from January 2008
  // ("-0" holds the month's posts with ids from before it, see lib/sitemap.js)
  const match = /^(\d{4})_(\d{2})-(\d{1,6})$/.exec(query.batch || '');
  if (!match) return { notFound: true };
  const [, year, month, batchStr] = match;
  const batch = parseInt(batchStr, 10);

  try {
    const ids = await batchIds(`${year}-${month}`, batch);
    if (!ids) return { notFound: true };

    send(res, ids.map((id) => `/Thread/${encodeURIComponent(id)}`));
  } catch (error) {
    console.error('Error generating sitemap batch:', error.message);
    res.statusCode = 500;
    res.end();
  }

  return { props: {} };
}

export default SiteMap;
