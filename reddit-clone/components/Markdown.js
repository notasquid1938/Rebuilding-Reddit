import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { decodeEntities } from '@/lib/format';

const REDDIT_HOST_RE = /^https?:\/\/(?:www\.|old\.|new\.|np\.)?reddit\.com/i;

// Point links to Reddit threads, communities and users at their archived copies
function localHref(href) {
  if (!href) return null;
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

const MarkdownLink = ({ href, children }) => {
  const local = localHref(href);
  if (local) {
    return (
      <Link href={local} onClick={(e) => e.stopPropagation()}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>
      {children}
    </a>
  );
};

const components = { a: MarkdownLink, img: ({ alt }) => <span>{alt}</span> };

// Plain "r/foo" and "/u/bar" mentions become links, as they do on Reddit
function linkifyMentions(text) {
  return text.replace(/(^|\s)\/?(r|u)\/([A-Za-z0-9_-]{2,21})\b/g, '$1[$2/$3](/$2/$3)');
}

const Markdown = ({ children, className = '' }) => {
  if (!children) return null;
  return (
    <div className={`md ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkifyMentions(decodeEntities(children))}
      </ReactMarkdown>
    </div>
  );
};

export default Markdown;
