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

// "1h2m3s", "90s" or "90" (YouTube's t= / start=) in seconds, or 0
function startSeconds(value) {
  if (!value) return 0;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
  return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0;
}

// Players Reddit showed in place of a link, as an iframe: `frame` sets its
// shape ('wide' 16:9, 'tall' for portrait clips, 'audio' and 'tweet' at a
// fixed height) and `play` whether it waits behind a play button, so a feed
// doesn't load a player per post
function embed(host, provider, src, frame = 'wide', play = true) {
  return { type: 'embed', provider, src, frame, play, host };
}

function youtube(url, host) {
  const path = url.pathname;
  let id = null;
  if (host === 'youtu.be') id = path.slice(1);
  else if (path === '/watch') id = url.searchParams.get('v');
  else id = (/^\/(?:shorts|embed|live|v)\/([^/]+)/.exec(path) || [])[1];
  if (!id || !/^[\w-]{6,15}$/.test(id)) return null;
  const start = startSeconds(url.searchParams.get('t') || url.searchParams.get('start'));
  return {
    ...embed(host, 'youtube', `https://www.youtube-nocookie.com/embed/${id}?autoplay=1${start ? `&start=${start}` : ''}`),
    thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
  };
}

// Work out how a post's URL should be previewed.
export function getMedia(post) {
  if (!post.url || post.is_self) return null;
  // Pushshift kept URLs HTML-escaped ("?a=1&amp;b=2")
  const url = parseUrl(post.url.replace(/&amp;/g, '&'));
  if (!url || !/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');
  const pathname = url.pathname;
  let m;

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

  if (['youtube.com', 'youtu.be', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    const media = youtube(url, host);
    if (media) return media;
  }

  // Reddit's own video player: HLS (with sound) or a silent MP4
  if (host === 'v.redd.it' && (m = /^\/([a-z0-9]{5,20})(?:\/|$)/i.exec(pathname))) {
    return { type: 'redditVideo', id: m[1], host };
  }

  // RedGIFs: /watch/<id>, /ifr/<id> and the i.redgifs.com stills share one id
  if (/(^|\.)redgifs\.com$/.test(host)) {
    m = /^\/(?:watch|ifr|i)\/([a-z0-9]+)/i.exec(pathname);
    // Loads by itself (as on Reddit) and starts muted
    if (m) return embed(host, 'redgifs', `https://www.redgifs.com/ifr/${m[1].toLowerCase()}`, 'tall', false);
  }

  if (host === 'streamable.com' && (m = /^\/(?:[eo]\/)?([a-z0-9]{4,12})$/i.exec(pathname))) {
    return embed(host, 'streamable', `https://streamable.com/e/${m[1]}`);
  }

  // Twitch wants the embedding page's hostname as "parent" (added when played)
  m = host === 'clips.twitch.tv' ? /^\/([\w-]{4,100})$/.exec(pathname)
    : /twitch\.tv$/.test(host) ? /^\/[\w]+\/clip\/([\w-]{4,100})/.exec(pathname) : null;
  if (m && m[1] !== 'embed') return embed(host, 'twitch', `https://clips.twitch.tv/embed?clip=${m[1]}`);

  if (host === 'vimeo.com' && (m = /^\/(\d{5,12})(?:\/|$)/.exec(pathname))) {
    return embed(host, 'vimeo', `https://player.vimeo.com/video/${m[1]}?autoplay=1`);
  }

  if (host === 'tiktok.com' && (m = /^\/@[\w.-]+\/video\/(\d{8,25})/.exec(pathname))) {
    return embed(host, 'tiktok', `https://www.tiktok.com/embed/v2/${m[1]}`, 'tall');
  }

  if (['twitter.com', 'mobile.twitter.com', 'x.com'].includes(host) && (m = /^\/\w+\/status(?:es)?\/(\d{5,25})/.exec(pathname))) {
    return embed(host, 'twitter', `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}&dnt=true`, 'tweet', false);
  }

  if (host === 'open.spotify.com') {
    m = /^\/(?:intl-[\w-]+\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/.exec(pathname);
    if (m) {
      return { ...embed(host, 'spotify', `https://open.spotify.com/embed/${m[1]}/${m[2]}`, 'audio', false),
        height: m[1] === 'track' || m[1] === 'episode' ? 152 : 352 };
    }
  }

  if (host === 'soundcloud.com' && (m = /^\/([\w-]+)\/(sets\/)?([\w-]+)\/?$/.exec(pathname))) {
    const track = `https://soundcloud.com/${m[1]}/${m[2] || ''}${m[3]}`;
    return { ...embed(host, 'soundcloud', `https://w.soundcloud.com/player/?url=${encodeURIComponent(track)}&visual=false`, 'audio', false),
      height: m[2] ? 352 : 166 };
  }

  // GIPHY pages end in the GIF's id ("/gifs/the-simpsons-3o6MbaRaj7fmVOM61G")
  if (host === 'giphy.com' && (m = /^\/(?:gifs|embed)\/(?:[\w-]*-)?([A-Za-z0-9]{6,40})\/?$/.exec(pathname))) {
    return { type: 'image', src: `https://i.giphy.com/${m[1]}.gif` };
  }

  // Twitter images name their format in the query ("/media/abc?format=jpg")
  if (host === 'pbs.twimg.com' && /^\/media\/[\w-]+$/.test(pathname) && /^(jpg|png|webp)$/.test(url.searchParams.get('format') || '')) {
    return { type: 'image', src: `https://pbs.twimg.com${pathname}?format=${url.searchParams.get('format')}&name=large` };
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
