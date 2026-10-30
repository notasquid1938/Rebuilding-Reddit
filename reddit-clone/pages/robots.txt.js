import { sitemapBatches, indexPageCount } from '@/lib/sitemap';
import { SITE_URL } from '@/lib/site';

// A crawler follows only the group naming it, so each named group repeats
// what it may fetch. /stats/ is the visitor-analytics script and beacon:
// Googlebot ran it on every page it rendered, spending crawl budget on
// beacons Umami drops anyway

// Crawlers slowed to a page every 5 seconds: each fetched several pages a
// second from the archive disk (ClaudeBot ~7; PerplexityBot 3 on Oct 30,
// mostly profiles, alongside Applebot), slowing the site for everyone
const SLOWED = ['ClaudeBot', 'PerplexityBot', 'Applebot'];

const RULES = [
  ...SLOWED.flatMap((agent) => [`User-agent: ${agent}`, 'Crawl-delay: 5', 'Allow: /', 'Disallow: /stats/', '']),
  // SEO-tool crawler: no benefit to the site
  'User-agent: AhrefsBot',
  'Disallow: /',
  '',
  'User-agent: *',
  'Allow: /',
  'Disallow: /stats/',
  '',
];

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
  res.write([...RULES, ...sitemaps, ''].join('\n'));
  res.end();
  return { props: {} };
}

export default Robots;
