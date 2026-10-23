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

export function threadStructuredData(post) {
  const url = `${SITE_URL}/Thread/${post.id}`;
  const headline = decodeEntities(post.title || '');
  const body = post.is_self && post.selftext && !REMOVED.includes(post.selftext) ? decodeEntities(post.selftext) : '';
  const deleted = !post.author || post.author === '[deleted]';
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
    author: deleted
      ? { '@type': 'Person', name: '[deleted]' }
      : { '@type': 'Person', name: post.author, url: `${SITE_URL}/User/${post.author}` },
    interactionStatistic: [counter('LikeAction', post.score), counter('CommentAction', post.num_comments)],
  };
  if (!post.is_self && post.url) data.sharedContent = { '@type': 'WebPage', url: post.url };
  if (post.subreddit) {
    data.isPartOf = { '@type': 'WebPage', name: `r/${post.subreddit}`, url: `${SITE_URL}/r/${post.subreddit}` };
  }
  return data;
}

// For a <script type="application/ld+json">: "<" is escaped so text in a post
// can't close the script element
export const jsonLd = (data) => JSON.stringify(data).replace(/</g, '\\u003c');
