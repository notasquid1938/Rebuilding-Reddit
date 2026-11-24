import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { decodeEntities } from '@/lib/format';
import { linkTarget } from '@/lib/links';

// A link with no text is a community's CSS trick (`[](/flair)` drew an icon on
// Reddit) and shows nothing
const MarkdownLink = ({ href, children }) => {
  const empty = !children || (Array.isArray(children) && children.length === 0);
  if (empty) return null;
  const target = linkTarget(href);
  if (!target) return <span>{children}</span>;
  if (target.local) {
    return (
      <Link href={target.local} onClick={(e) => e.stopPropagation()}>
        {children}
      </Link>
    );
  }
  return (
    <a href={target.href} target="_blank" rel="noopener noreferrer nofollow ugc" onClick={(e) => e.stopPropagation()}>
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
