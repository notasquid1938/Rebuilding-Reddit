const REDDIT_HOST_RE = /^https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com/i;
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

// Point links to Reddit threads, communities and users at their archived copies
function localHref(href) {
  const path = href.replace(REDDIT_HOST_RE, '');
  if (!path.startsWith('/')) return null;
  let m = /^\/r\/[^/]+\/comments\/([a-z0-9]+)/i.exec(path);
  if (m) return `/Thread/${m[1].toLowerCase()}`;
  m = /^\/r\/(u_[A-Za-z0-9_-]+|[A-Za-z0-9_.]+)\/?$/.exec(path);
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

// The archived copy of a link someone pasted: a thread, community or user on
// any Reddit host (with or without "https://"), a redd.it short link, or a
// link to this site. null for anything else, such as a Reddit app share link
// (/r/name/s/...), which only Reddit can resolve
export function archivedPath(input) {
  const text = String(input || '').trim();
  const short = /^(?:https?:\/\/)?(?:www\.)?redd\.it\/([a-z0-9]+)\/?(?:[?#].*)?$/i.exec(text);
  if (short) return `/Thread/${short[1].toLowerCase()}`;
  const host = /^(?:https?:\/\/)?(?:(?:www|old|new|np|m|sh)\.)?(?:reddit|redditrebuilt)\.com(?=[/?#]|$)/i.exec(text);
  if (!host && !text.startsWith('/')) return null;
  const path = text.slice(host ? host[0].length : 0).replace(/[?#].*$/, '');
  const m = /^\/(?:r\/[^/]+\/)?comments\/([a-z0-9]+)/i.exec(path);
  if (m) return `/Thread/${m[1].toLowerCase()}`;
  const thread = /^\/Thread\/([a-z0-9]+)\/?$/i.exec(path);
  if (thread) return `/Thread/${thread[1].toLowerCase()}`;
  const user = /^\/(?:u|user|User)\/([A-Za-z0-9_-]+)(?:\/[^/]*)?\/?$/.exec(path);
  if (user) return `/User/${user[1]}`;
  if (/^\/r\/[^/]+\/s\//.test(path)) return null;
  const community = /^\/r\/(u_[A-Za-z0-9_-]+|[A-Za-z0-9_.]+)(?:\/|$)/.exec(path);
  return community ? `/r/${community[1]}` : null;
}
