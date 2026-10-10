import path from 'path';
import fs from 'fs';
import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';

// Runtime mount (see docker-compose.yml), deliberately excluded from build tracing
const DATA_DIR = process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '../Data');
const ICONS_DIR = path.join(DATA_DIR, 'reddit/icons');

// Cache of subreddit -> { path, type } (or null when there is no archived icon)
const iconCache = new Map();

const ICON_TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

// scrape_icons.py saves <lowercase name>.<ext>; older icons were <Name>.png
function findIcon(subreddit) {
  const candidates = [
    ...Object.keys(ICON_TYPES).map((ext) => [`${subreddit.toLowerCase()}.${ext}`, ext]),
    [`${subreddit}.png`, 'png'],
  ];
  for (const [file, ext] of candidates) {
    const candidate = path.join(ICONS_DIR, file);
    if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) return { path: candidate, type: ICON_TYPES[ext] };
  }
  return null;
}

const PALETTE = ['#FF4500', '#0079D3', '#46D160', '#FFB000', '#7193FF', '#FF585B', '#0DD3BB', '#DB0064', '#9E58FF', '#349E48'];

// Generated "r/" avatar in the style of Reddit's default community icon
function fallbackIcon(subreddit) {
  let hash = 0;
  for (const ch of subreddit.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = PALETTE[hash % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="${color}"/><text x="20" y="26.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="700" fill="#fff">r/</text></svg>`;
}

export default async (req, res) => {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 400, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { subreddit } = req.query;

  // Validate subreddit name ("reddit.com" was a real subreddit, so dots are allowed)
  if (!subreddit || subreddit.length > 100 || !/^[a-zA-Z0-9_.]+$/.test(subreddit) || subreddit.includes('..')) {
    return res.status(400).json({ error: 'Invalid subreddit name' });
  }

  try {
    let icon = iconCache.get(subreddit);
    if (icon === undefined) {
      icon = findIcon(subreddit);
      if (iconCache.size > 5000) iconCache.clear();
      // Missing icons may be scraped later, so only cache hits
      if (icon) iconCache.set(subreddit, icon);
    }

    if (icon) {
      res.writeHead(200, {
        'Content-Type': icon.type,
        'Cache-Control': 'public, max-age=604800',
      });
      return res.end(fs.readFileSync(/*turbopackIgnore: true*/ icon.path));
    }

    res.writeHead(200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(fallbackIcon(subreddit));
  } catch (error) {
    console.error('Error fetching subreddit icon:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
