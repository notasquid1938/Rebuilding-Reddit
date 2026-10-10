// Public origin used for absolute links (sitemaps, canonical URLs, share links rendered on the server)
export const SITE_URL = (process.env.SITE_URL || 'https://redditrebuilt.com').replace(/\/$/, '');
export const SITE_NAME = 'Reddit Rebuilt';
export const SITEMAP_BATCH_SIZE = 20000;
export const DEFAULT_RANGE = { from: '2005-06', to: '2006-12' };
