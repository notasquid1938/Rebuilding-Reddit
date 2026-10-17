import { sitemapBatches, SITEMAPS_PER_INDEX } from '@/lib/sitemap';
import { SITE_URL } from '@/lib/site';

// Sitemap index, split into pages (/sitemap.xml, /sitemap.xml?page=2, ...)
// that robots.txt lists; see lib/sitemap.js
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

export async function getServerSideProps({ res, query }) {
  const page = query.page === undefined ? 1 : /^\d{1,4}$/.test(query.page) ? parseInt(query.page, 10) : 0;
  if (page < 1) return { notFound: true };
  try {
    const batches = (await sitemapBatches()).slice((page - 1) * SITEMAPS_PER_INDEX, page * SITEMAPS_PER_INDEX);
    if (batches.length === 0) return { notFound: true };

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
