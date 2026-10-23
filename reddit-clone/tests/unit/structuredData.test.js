import { describe, expect, it } from 'vitest';
import { threadStructuredData, jsonLd } from '@/lib/structuredData';
import { SITE_URL } from '@/lib/site';

const post = (fields) => ({
  id: 'abc', title: 'Hello &amp; welcome', author: 'alice', subreddit: 'pics', score: 12, num_comments: 3,
  created_utc: 1136073600, is_self: false, url: 'https://example.com/a.jpg', selftext: '', ...fields,
});

describe('threadStructuredData', () => {
  it('describes a link post', () => {
    const data = threadStructuredData(post({}));
    expect(data).toMatchObject({
      '@type': 'DiscussionForumPosting',
      url: `${SITE_URL}/Thread/abc`,
      headline: 'Hello & welcome',
      text: 'Hello & welcome',
      datePublished: '2006-01-01T00:00:00.000Z',
      author: { name: 'alice', url: `${SITE_URL}/User/alice` },
      sharedContent: { url: 'https://example.com/a.jpg' },
      isPartOf: { name: 'r/pics', url: `${SITE_URL}/r/pics` },
    });
    expect(data.interactionStatistic.map((s) => s.userInteractionCount)).toEqual([12, 3]);
  });

  it('uses the body of a self post and leaves out removed text', () => {
    expect(threadStructuredData(post({ is_self: true, selftext: 'Body' })).text).toBe('Body');
    expect(threadStructuredData(post({ is_self: true, selftext: '[removed]' })).text).toBe('Hello & welcome');
    expect(threadStructuredData(post({ is_self: true, selftext: 'Body' })).sharedContent).toBeUndefined();
  });

  it('handles deleted authors and negative scores', () => {
    const data = threadStructuredData(post({ author: '[deleted]', score: -5 }));
    expect(data.author).toEqual({ '@type': 'Person', name: '[deleted]' });
    expect(data.interactionStatistic[0].userInteractionCount).toBe(0);
  });
});

describe('jsonLd', () => {
  it('cannot close the script element', () => {
    const out = jsonLd({ text: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out).text).toBe('</script><script>alert(1)</script>');
  });
});
