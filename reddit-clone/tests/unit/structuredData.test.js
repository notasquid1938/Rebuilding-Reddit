import { describe, expect, it } from 'vitest';
import { threadStructuredData, commentStructuredData, jsonLd } from '@/lib/structuredData';
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

const comment = (id, fields) => ({
  id, body: `Comment ${id}`, author: 'bob', score: 4, created_utc: 1136073600, replies: [], ...fields,
});

describe('commentStructuredData', () => {
  it('nests replies under their comment', () => {
    const [top] = commentStructuredData([comment('a', { replies: [comment('b', { body: 'Fish &amp; chips' })] })]);
    expect(top).toMatchObject({
      '@type': 'Comment',
      text: 'Comment a',
      datePublished: '2006-01-01T00:00:00.000Z',
      author: { name: 'bob', url: `${SITE_URL}/User/bob` },
    });
    expect(top.interactionStatistic[0].userInteractionCount).toBe(4);
    expect(top.comment).toHaveLength(1);
    expect(top.comment[0].text).toBe('Fish & chips');
    expect(top.comment[0].comment).toBeUndefined();
  });

  it('keeps top-level comments first when there are too many', () => {
    const tree = ['a', 'b', 'c'].map((id) => comment(id, { replies: [comment(`${id}1`), comment(`${id}2`)] }));
    const data = commentStructuredData(tree, 4);
    expect(data.map((c) => c.text)).toEqual(['Comment a', 'Comment b', 'Comment c']);
    expect(data[0].comment.map((c) => c.text)).toEqual(['Comment a1']);
    expect(data[1].comment).toBeUndefined();
    expect(data[2].comment).toBeUndefined();
  });

  it('handles deleted authors and no comments', () => {
    expect(commentStructuredData([comment('a', { author: '[deleted]' })])[0].author).toEqual({ '@type': 'Person', name: '[deleted]' });
    expect(commentStructuredData([])).toEqual([]);
    expect(commentStructuredData(undefined)).toEqual([]);
  });

  it('is attached to the thread only when there are comments', () => {
    expect(threadStructuredData(post({})).comment).toBeUndefined();
    const data = threadStructuredData(post({}), commentStructuredData([comment('a')]));
    expect(data.comment[0].text).toBe('Comment a');
  });
});

describe('jsonLd', () => {
  it('cannot close the script element', () => {
    const out = jsonLd({ text: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('<');
    expect(JSON.parse(out).text).toBe('</script><script>alert(1)</script>');
  });
});
