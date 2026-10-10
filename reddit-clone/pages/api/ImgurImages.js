import path from 'path';
import fs from 'fs';
import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';

// Runtime mount (see docker-compose.yml), deliberately excluded from build tracing
const DATA_DIR = process.env.DATA_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), '../Data');
const IMAGES_DIR = path.join(DATA_DIR, 'imgur/images');
const SUPPORTED_EXTENSIONS = ['png', 'jpeg', 'jpg', 'gif', 'webp', 'tiff'];
const CONTENT_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', tiff: 'image/tiff' };

// Cache of image id -> archived file (or null when not archived)
const imageCache = new Map();

function findArchivedImage(imageId) {
  if (imageCache.has(imageId)) return imageCache.get(imageId);
  let found = null;
  for (const ext of SUPPORTED_EXTENSIONS) {
    const fullPath = path.join(IMAGES_DIR, `${imageId}.${ext}`);
    if (fs.existsSync(/*turbopackIgnore: true*/ fullPath)) {
      found = { path: fullPath, ext };
      break;
    }
  }
  if (imageCache.size > 10000) imageCache.clear();
  imageCache.set(imageId, found);
  return found;
}

// Serves an image from the local Imgur archive (Data/imgur/images/<id>.<ext>),
// falling back to Imgur itself for images that haven't been archived.
export default async (req, res) => {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 400, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  // Accept "abc123" as well as "abc123.jpg"
  const match = /^([a-zA-Z0-9]{1,50})(?:\.([a-zA-Z0-9]{2,5}))?$/.exec(req.query.id || '');
  if (!match) {
    return res.status(400).json({ error: 'Invalid image ID format' });
  }
  const [, imageId, requestedExt] = match;

  try {
    const archived = findArchivedImage(imageId);
    if (archived) {
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[archived.ext],
        'Cache-Control': 'public, max-age=31536000, immutable',
      });
      return res.end(fs.readFileSync(/*turbopackIgnore: true*/ archived.path));
    }

    const ext = requestedExt && CONTENT_TYPES[requestedExt.toLowerCase()] ? requestedExt.toLowerCase() : 'jpg';
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.redirect(302, `https://i.imgur.com/${imageId}.${ext}`);
  } catch (error) {
    console.error('Error fetching Image:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
