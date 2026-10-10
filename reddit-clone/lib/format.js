// Client-safe formatting helpers shared by the feed, thread and profile pages.

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Pushshift stores titles and bodies HTML-escaped ("&amp;gt;"); decode in one
// pass so "&amp;lt;" becomes the literal text "&lt;" rather than "<".
export function decodeEntities(text) {
  if (!text) return text;
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code = entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

export function timeAgo(utcSeconds, now = Date.now()) {
  if (!utcSeconds) return '';
  const seconds = Math.max(0, Math.floor(now / 1000 - utcSeconds));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'just now';
  if (hours < 1) return `${minutes} min. ago`;
  if (days < 1) return `${hours} hr. ago`;
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30.44);
  if (months < 12) return `${months} mo. ago`;
  return `${Math.floor(days / 365.25)} yr. ago`;
}

export function fullDate(utcSeconds) {
  if (!utcSeconds) return '';
  return new Date(utcSeconds * 1000).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }) + ' UTC';
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(month) {
  if (!month) return '';
  const [y, m] = month.split('-');
  return `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`;
}
export const MONTHS = MONTH_NAMES;

export function formatCount(n) {
  if (n === null || n === undefined) return '';
  const abs = Math.abs(n);
  if (abs < 1000) return String(n);
  if (abs < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (abs < 1000000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
}

const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp)(\?.*)?$/i;

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Work out how a post's URL should be previewed.
export function getMedia(post) {
  if (!post.url || post.is_self) return null;
  const url = parseUrl(post.url);
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const pathname = url.pathname;

  if (host === 'imgur.com' || host === 'i.imgur.com') {
    const match = /^\/([a-zA-Z0-9]{5,10})(\.[a-zA-Z0-9]+)?$/.exec(pathname);
    if (match) {
      const ext = (match[2] || '').toLowerCase();
      if (ext === '.gifv' || ext === '.mp4') {
        return { type: 'video', src: `https://i.imgur.com/${match[1]}.mp4`, poster: `/api/ImgurImages?id=${match[1]}.jpg` };
      }
      return { type: 'image', src: `/api/ImgurImages?id=${match[1]}${ext}` };
    }
    return { type: 'link', host };
  }

  if (host === 'youtube.com' || host === 'youtu.be') {
    const id = host === 'youtu.be' ? pathname.slice(1) : url.searchParams.get('v');
    if (id && /^[\w-]{6,15}$/.test(id)) {
      return { type: 'youtube', id, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, host };
    }
  }

  if (host === 'i.redd.it' || IMAGE_EXT_RE.test(pathname)) {
    return { type: 'image', src: url.href };
  }

  return { type: 'link', host };
}

export function thumbnailUrl(post) {
  const t = post.thumbnail;
  return t && /^https?:\/\//.test(t) ? t : null;
}

export function postPath(post) {
  return `/Thread/${post.id}`;
}
