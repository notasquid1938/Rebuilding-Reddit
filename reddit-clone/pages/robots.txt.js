import { sitemapBatches, indexPageCount } from '@/lib/sitemap';
import { SITE_URL } from '@/lib/site';

// A crawler follows only the group naming it, so each named group repeats
// what it may fetch. /stats/ is the visitor-analytics script and beacon:
// Googlebot ran it on every page it rendered, spending crawl budget on
// beacons Umami drops anyway

// Crawler slowed to a page every 5 seconds: it fetched ~7 pages a second
// from the archive disk, slowing the site for everyone
const SLOWED = ['ClaudeBot'];

// Crawlers turned away. AhrefsBot is an SEO tool. PerplexityBot and Applebot
// ignored Crawl-delay at ~3 pages a second each (Oct 30-31), keeping the
// archive disk busy enough to crowd out Googlebot, and sent no visitors
const BLOCKED = ['AhrefsBot', 'PerplexityBot', 'Applebot'];

const RULES = [
  ...SLOWED.flatMap((agent) => [`User-agent: ${agent}`, 'Crawl-delay: 5', 'Allow: /', 'Disallow: /stats/', '']),
  ...BLOCKED.flatMap((agent) => [`User-agent: ${agent}`, 'Disallow: /', '']),
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
