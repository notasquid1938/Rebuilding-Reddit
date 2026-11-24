// schema.org markup Google reads for forum threads ("Discussions and forums"):
// https://developers.google.com/search/docs/appearance/structured-data/discussion-forum
import { SITE_URL } from '@/lib/site';
import { decodeEntities } from '@/lib/format';

const REMOVED = ['[deleted]', '[removed]'];
const MAX_TEXT = 5000;

const counter = (type, count) => ({
  '@type': 'InteractionCounter',
  interactionType: `https://schema.org/${type}`,
  userInteractionCount: Math.max(0, Math.trunc(Number(count) || 0)),
});

const MAX_COMMENTS = 50;
const MAX_COMMENT_TEXT = 1000;

const person = (name) =>
  !name || name === '[deleted]'
    ? { '@type': 'Person', name: '[deleted]' }
    : { '@type': 'Person', name, url: `${SITE_URL}/User/${name}` };

// The first comments of a thread as nested schema.org Comments, breadth first
// so the top-level ones are kept when there are more than `max`
export function commentStructuredData(comments, max = MAX_COMMENTS) {
  const top = [];
  const queue = (comments || []).map((comment) => [comment, top]);
  let count = 0;
  while (queue.length && count < max) {
    const [c, siblings] = queue.shift();
    const node = {
      '@type': 'Comment',
      text: decodeEntities(c.body || '').slice(0, MAX_COMMENT_TEXT),
      datePublished: new Date(Number(c.created_utc) * 1000).toISOString(),
      author: person(c.author),
      interactionStatistic: [counter('LikeAction', c.score)],
    };
    siblings.push(node);
    count++;
    if (c.replies?.length) {
      node.comment = [];
      for (const reply of c.replies) queue.push([reply, node.comment]);
    }
  }
  // Drop the reply lists that ran past the limit before getting an entry
  const prune = (nodes) => nodes.forEach((n) => (n.comment?.length ? prune(n.comment) : delete n.comment));
  prune(top);
  return top;
}

export function threadStructuredData(post, comments = []) {
  const url = `${SITE_URL}/Thread/${post.id}`;
  const headline = decodeEntities(post.title || '');
  const body = post.is_self && post.selftext && !REMOVED.includes(post.selftext) ? decodeEntities(post.selftext) : '';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    '@id': url,
    url,
    mainEntityOfPage: url,
    headline,
    // Google needs text, an image or a video; a link post's text is its title
    text: (body || headline).slice(0, MAX_TEXT),
    datePublished: new Date(Number(post.created_utc) * 1000).toISOString(),
    author: person(post.author),
    interactionStatistic: [counter('LikeAction', post.score), counter('CommentAction', post.num_comments)],
  };
  if (comments.length) data.comment = comments;
  if (!post.is_self && post.url) data.sharedContent = { '@type': 'WebPage', url: post.url };
  if (post.subreddit) {
    data.isPartOf = { '@type': 'WebPage', name: `r/${post.subreddit}`, url: `${SITE_URL}/r/${post.subreddit}` };
  }
  return data;
}

// For a <script type="application/ld+json">: "<" is escaped so text in a post
// can't close the script element
export const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
