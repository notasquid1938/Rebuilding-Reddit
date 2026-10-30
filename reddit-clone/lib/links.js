const REDDIT_HOST_RE = /^https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

// Point links to Reddit threads, communities and users at their archived copies
function localHref(href) {
  const path = href.replace(REDDIT_HOST_RE, '');
  if (!path.startsWith('/')) return null;
  let m = /^\/r\/[^/]+\/comments\/([a-z0-9]+)/i.exec(path);
  if (m) return `/Thread/${m[1].toLowerCase()}`;
  m = /^\/r\/([A-Za-z0-9_.]+)\/?$/.exec(path);
  if (m) return `/r/${m[1]}`;
  m = /^\/u(?:ser)?\/([A-Za-z0-9_-]+)\/?$/.exec(path);
  if (m) return `/User/${m[1]}`;
  return null;
}

// Where a link in archived Reddit text goes: { local } for a page of this
// site, { href } for anywhere else, or null for no link. Paths with no host
// meant Reddit (a community's wiki or search, "/message/compose"), and
// relative ones resolved against the page they were on, so both would 404 here
export function linkTarget(href) {
  if (!href) return null;
  const local = localHref(href);
  if (local) return { local };
  if (href.startsWith('//')) return { href: `https:${href}` };
  if (href.startsWith('/')) return { href: `https://www.reddit.com${href}` };
  if (href.startsWith('#') || SCHEME_RE.test(href)) return { href };
  return null;
}
