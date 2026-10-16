import { test, expect } from '@playwright/test';
import { FIXTURE } from './fixtures';

const get = async (request, url, status = 200) => {
  const response = await request.get(url);
  expect(response.status(), url).toBe(status);
  return response.json();
};

test.describe('AvailableDates', () => {
  test('lists loaded months', async ({ request }) => {
    expect((await get(request, '/api/AvailableDates')).collections).toEqual(FIXTURE.months);
  });
});

test.describe('Posts', () => {
  test('top feed is sorted by score across months', async ({ request }) => {
    const posts = await get(request, '/api/Posts?startDate=2005-06&endDate=2006-12&page=1&limit=8');
    expect(posts.map((p) => p.id)).toEqual(['b001', 'c001', 'b002', 'b003', 'b004', 'b005', 'd001', 'c002']);
    expect(posts[0]).toMatchObject({ title: 'Top &amp; best post of December', author: 'alice', score: 5000, subreddit: 'reddit.com' });
  });

  test('pages through the whole range without gaps or duplicates', async ({ request }) => {
    const ids = [];
    let previousScore = Infinity;
    for (let page = 1; page < 20; page++) {
      const posts = await get(request, `/api/Posts?startDate=2005-06&endDate=2006-12&page=${page}&limit=15`);
      for (const post of posts) {
        expect(post.score).toBeLessThanOrEqual(previousScore);
        previousScore = post.score;
        ids.push(post.id);
      }
      if (posts.length < 15) break;
    }
    expect(ids).toHaveLength(FIXTURE.postsInDefaultRange);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('all-time feed includes later months', async ({ request }) => {
    const posts = await get(request, '/api/Posts?page=1&limit=3');
    expect(posts.map((p) => p.id)).toEqual(['b001', 'c001', 'e001']);
  });

  test('community feed resolves the name case-insensitively', async ({ request }) => {
    const posts = await get(request, '/api/Posts?subreddit=PROGRAMMING&page=1&limit=4');
    expect(posts.map((p) => p.id)).toEqual(['c001', 'b002', 'b005', 'd001']);
    expect(posts.every((p) => p.subreddit === 'programming')).toBe(true);
  });

  test('user feed sorts by new and top', async ({ request }) => {
    const newest = await get(request, '/api/Posts?author=alice&sort=new&page=1&limit=10');
    expect(newest.map((p) => p.id)).toEqual(['e001', 'd001', 'c001', 'b001']);
    const top = await get(request, '/api/Posts?author=alice&sort=top&page=1&limit=10');
    expect(top.map((p) => p.id)).toEqual(['b001', 'c001', 'e001', 'd001']);
  });

  test('front page sorts other than top', async ({ request }) => {
    const ids = async (sort, range = 'startDate=2005-12&endDate=2005-12') =>
      (await get(request, `/api/Posts?${range}&sort=${sort}&page=1&limit=3`)).map((p) => p.id);
    expect(await ids('controversial')).toEqual(['b003', 'b002', 'b001']);
    expect(await ids('comments')).toEqual(['b003', 'b002', 'b001']);
    expect(await ids('new')).toEqual(['b005', 'b003', 'b002']);
    expect(await ids('old', 'all=1')).toEqual(['b100', 'b101', 'b102']);
    expect(await ids('new', 'all=1')).toEqual(['e001', 'e104', 'e103']);
  });

  test('community feed sorts other than top', async ({ request }) => {
    const newest = await get(request, '/api/Posts?subreddit=programming&sort=new&page=1&limit=2');
    expect(newest.map((p) => p.id)).toEqual(['d001', 'd107']);
    const oldest = await get(request, '/api/Posts?subreddit=programming&sort=old&page=1&limit=2');
    expect(oldest.map((p) => p.id)).toEqual(['b101', 'b104']);
    const discussed = await get(request, '/api/Posts?subreddit=programming&sort=comments&page=1&limit=1');
    expect(discussed.map((p) => p.id)).toEqual(['b002']);
  });

  test('pages through a rollup sort without gaps or duplicates', async ({ request }) => {
    const ids = [];
    for (let page = 1; page < 20; page++) {
      const response = await request.get(`/api/Posts?startDate=2005-06&endDate=2006-12&sort=new&page=${page}&limit=15`);
      expect(response.headers()['x-feed-truncated']).toBeUndefined();
      const posts = await response.json();
      ids.push(...posts.map((p) => p.id));
      if (posts.length < 15) break;
    }
    expect(ids).toHaveLength(FIXTURE.postsInDefaultRange);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('user feed sorts', async ({ request }) => {
    const ids = async (sort) => (await get(request, `/api/Posts?author=alice&sort=${sort}&page=1&limit=10`)).map((p) => p.id);
    expect(await ids('old')).toEqual(['b001', 'c001', 'd001', 'e001']);
    expect((await ids('comments'))[0]).toBe('b001');
  });

  test('unknown sorts fall back to top', async ({ request }) => {
    const posts = await get(request, '/api/Posts?startDate=2005-06&endDate=2006-12&sort=hot&page=1&limit=1');
    expect(posts[0].id).toBe('b001');
  });

  test('string scores and timestamps from old dumps are numbers', async ({ request }) => {
    const posts = await get(request, '/api/Posts?author=alice&page=1&limit=1');
    expect(typeof posts[0].score).toBe('number');
    const [deleted] = (await get(request, '/api/Posts?startDate=2005-12&endDate=2005-12&page=1&limit=50'))
      .filter((p) => p.id === 'b004');
    expect(deleted).toMatchObject({ author: '[deleted]', score: 150, created_utc: 1134000000 });
  });

  for (const [query, why] of [
    ['startDate=2005-6', 'bad month'],
    ['subreddit=bad%20name', 'bad subreddit'],
    ['author=%5Bdeleted%5D', 'bad author'],
    ['page=10001', 'page out of range'],
    ['startDate=2005-12&startDate=2006-01', 'repeated parameter'],
  ]) {
    test(`rejects ${why}`, async ({ request }) => {
      await get(request, `/api/Posts?${query}`, 400);
    });
  }
});

test.describe('ID', () => {
  test('finds a post in any month', async ({ request }) => {
    expect(await get(request, '/api/ID?id=b001')).toMatchObject({ id: 'b001', num_comments: 5 });
    expect(await get(request, '/api/ID?id=E001')).toMatchObject({ id: 'e001', subreddit: 'AskHistory' });
  });

  test('returns detail fields', async ({ request }) => {
    expect(await get(request, '/api/ID?id=b002')).toMatchObject({
      is_self: true,
      selftext: 'Line one\n\n**bold** text,\ta tab and a NUL char &amp;gt; quoted',
    });
    expect(await get(request, '/api/ID?id=b005')).toMatchObject({ locked: true, stickied: true, flair: 'Discussion' });
  });

  test('404s for unknown ids and 400s for invalid ones', async ({ request }) => {
    await get(request, '/api/ID?id=zzzzzz', 404);
    await get(request, '/api/ID?id=b0%2001', 400);
    await get(request, '/api/ID', 400);
  });
});

test.describe('Comments', () => {
  test('builds the tree across monthly tables', async ({ request }) => {
    const { available, comments } = await get(request, '/api/Comments?id=b001&month=2005-12');
    expect(available).toBe(true);
    expect(comments.map((c) => c.id)).toEqual(['k001', 'm001', 'k004', 'k005']);
    expect(comments[0].replies[0]).toMatchObject({ id: 'k002', author: 'alice' });
    expect(comments[0].replies[0].replies[0]).toMatchObject({ id: 'k003', body: 'Nested reply' });
    expect(comments[2]).toMatchObject({ author: '[deleted]', body: '[removed]' });
  });

  test('sorts comments', async ({ request }) => {
    const ids = async (sort) =>
      (await get(request, `/api/Comments?id=b001&month=2005-12&sort=${sort}`)).comments.map((c) => c.id);
    expect(await ids('new')).toEqual(['m001', 'k005', 'k004', 'k001']);
    expect(await ids('old')).toEqual(['k001', 'k004', 'k005', 'm001']);
    expect(await ids('controversial')).toEqual(['k005', 'k001', 'm001', 'k004']);
    const { comments } = await get(request, '/api/Comments?id=b001&month=2005-12&sort=controversial');
    expect(comments[0].controversial).toBe(true);
    expect(comments[1].controversial).toBe(false);
  });

  test('pages top-level comments', async ({ request }) => {
    const { comments } = await get(request, '/api/Comments?id=b001&month=2005-12&page=2&commentsPerPage=2');
    expect(comments.map((c) => c.id)).toEqual(['k004', 'k005']);
  });

  test('reports months without comment dumps', async ({ request }) => {
    expect(await get(request, '/api/Comments?id=e001&month=2010-06')).toEqual({ available: false, comments: [] });
  });

  test('counts comments', async ({ request }) => {
    expect(await get(request, '/api/CommentCount?id=b001&month=2005-12')).toEqual({ available: true, totalComments: 6 });
  });

  test('loads replies', async ({ request }) => {
    const { replies } = await get(request, '/api/Replies?commentId=k002&month=2005-12');
    expect(replies.map((r) => r.id)).toEqual(['k003']);
  });

  test('validates input', async ({ request }) => {
    await get(request, '/api/Comments?id=b001&commentsPerPage=500', 400);
    await get(request, '/api/Comments?id=b001&month=2005', 400);
    await get(request, '/api/Replies', 400);
  });
});

test.describe('Subreddit', () => {
  test('merges archive stats with the about page', async ({ request }) => {
    const info = await get(request, '/api/Subreddit?name=programming');
    expect(info).toMatchObject({ name: 'programming', posts: 30, months: 3, firstMonth: '2005-12', lastMonth: '2006-02' });
    expect(info.about).toMatchObject({ title: 'Programming!', subscribers: 200000, color: '#336699', unavailable: false });
    expect(info.about.bannerUrl).toMatch(/^data:image\/svg\+xml/);
  });

  test('flags communities known only by name', async ({ request }) => {
    expect((await get(request, '/api/Subreddit?name=GoneSub')).about.unavailable).toBe(true);
  });

  test('404s for unknown communities', async ({ request }) => {
    await get(request, '/api/Subreddit?name=neverexisted', 404);
    await get(request, '/api/Subreddit?name=bad%20name', 400);
  });
});

test.describe('TopCommunities', () => {
  test('all time', async ({ request }) => {
    const { communities } = await get(request, '/api/TopCommunities');
    expect(communities.slice(0, 2).map((c) => c.name).sort()).toEqual(['programming', 'reddit.com']);
    expect(communities[2]).toEqual({ name: 'science', posts: 27 });
  });

  test('for a date range', async ({ request }) => {
    const { communities } = await get(request, '/api/TopCommunities?startDate=2010-01&endDate=2010-12');
    expect(communities).toEqual([{ name: 'AskHistory', posts: 6 }]);
  });
});

test.describe('User', () => {
  test('totals posts and karma', async ({ request }) => {
    expect(await get(request, '/api/User?name=alice')).toMatchObject({ posts: 4, karma: 5000 + 4000 + 777 + 100 });
  });
});

test.describe('SearchSuggestions', () => {
  test('matches a prefix', async ({ request }) => {
    const { suggestions } = await get(request, '/api/SearchSuggestions?query=PROG');
    expect(suggestions[0]).toMatchObject({ name: 'programming', posts: 30 });
  });

  test('ignores unsafe queries', async ({ request }) => {
    expect((await get(request, "/api/SearchSuggestions?query=a'%20OR%201=1")).suggestions).toEqual([]);
  });
});

test.describe('SubredditIcons', () => {
  test('serves archived icons by lowercase name', async ({ request }) => {
    for (const name of ['programming', 'PROGRAMMING']) {
      const response = await request.get(`/api/SubredditIcons?subreddit=${name}`);
      expect(response.headers()['content-type']).toBe('image/png');
    }
  });

  test('generates a placeholder otherwise', async ({ request }) => {
    const response = await request.get('/api/SubredditIcons?subreddit=pics');
    expect(response.headers()['content-type']).toBe('image/svg+xml');
  });

  test('rejects path traversal', async ({ request }) => {
    expect((await request.get('/api/SubredditIcons?subreddit=..%2F..%2Fetc')).status()).toBe(400);
  });
});

test.describe('Sitemaps', () => {
  test('index lists every month', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    const xml = await response.text();
    for (const month of FIXTURE.months) expect(xml).toContain(`/Sitemap/${month.replace('-', '_')}-1`);
  });

  test('month sitemap lists threads', async ({ request }) => {
    const xml = await (await request.get('/Sitemap/2005_12-1')).text();
    expect(xml).toContain('/Thread/b001');
  });
});
