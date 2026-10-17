import { sitemapBatches, indexPageCount } from '@/lib/sitemap';
import { SITE_URL } from '@/lib/site';

// Lists every page of the sitemap index (see lib/sitemap.js)
function Robots() {
  // getServerSideProps writes the response
}

export async function getServerSideProps({ res }) {
  let pages = 1;
  try {
    pages = indexPageCount((await sitemapBatches()).length);
  } catch (error) {
    console.error('Error counting sitemap pages:', error.message);
  }
  const sitemaps = Array.from({ length: pages }, (_, i) => `Sitemap: ${SITE_URL}/sitemap.xml${i ? `?page=${i + 1}` : ''}`);
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.write(['# Allow all crawlers', 'User-agent: *', 'Allow: /', ...sitemaps, ''].join('\n'));
  res.end();
  return { props: {} };
}

export default Robots;
