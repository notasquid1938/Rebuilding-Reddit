import { test, expect, FIXTURE } from './fixtures';

// Feeds are fetched client-side after navigation, so wait for the first post
async function feedTitles(page) {
  const titles = page.locator('article h2, article h3');
  await titles.first().waitFor();
  return titles.allTextContents();
}

test.describe('Home', () => {
  test('shows the top posts of the default range, decoded', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(FIXTURE.topPost.title)).toBeVisible();
    const titles = await feedTitles(page);
    expect(titles.slice(0, 3)).toEqual([FIXTURE.topPost.title, 'January winner', FIXTURE.selfPost.title]);
  });

  test('infinite scroll reaches the end of the feed', async ({ page }) => {
    await page.goto('/');
    const end = page.getByText("You've reached the end of this feed.");
    for (let i = 0; i < 15 && !(await end.isVisible()); i++) {
      await page.mouse.wheel(0, 20000);
      await page.waitForTimeout(300);
    }
    await expect(end).toBeVisible();
    await expect(page.locator('article')).toHaveCount(FIXTURE.postsInDefaultRange);
  });

  test('date range from the URL', async ({ page }) => {
    await page.goto('/?from=2010-01&to=2010-12');
    await expect(page.getByText(FIXTURE.laterPost.title)).toBeVisible();
    await expect(page.getByText(FIXTURE.topPost.title)).toHaveCount(0);
  });

  test('sort menu switches the feed and keeps the range', async ({ page }) => {
    await page.goto('/?from=2005-12&to=2005-12');
    await feedTitles(page);
    await page.getByRole('button', { name: 'Top' }).click();
    await page.getByRole('option', { name: 'Controversial' }).click();
    await expect(page).toHaveURL(/from=2005-12&to=2005-12&sort=controversial/);
    await expect(page.getByRole('button', { name: 'Controversial' })).toBeVisible();
    await expect(page.locator('article h2, article h3').first()).toHaveText(FIXTURE.nsfwPost.title);
  });

  test('sort from the URL survives a range change', async ({ page }) => {
    await page.goto('/?sort=new&t=all');
    expect((await feedTitles(page))[0]).toBe(FIXTURE.laterPost.title);
    await page.getByRole('button', { name: 'All time' }).click();
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/sort=new/);
  });

  test('an image that no longer loads still links to the original', async ({ page }) => {
    const url = 'http://127.0.0.1:9/gone.jpg';
    await page.route('**/api/Posts?*', (route) =>
      route.fulfill({
        json: [{ id: 'zz1', title: 'Dead image', subreddit: 'pics', author: 'alice', url, domain: '127.0.0.1',
                 score: 1, num_comments: 0, created_utc: 1134000000, is_self: false }],
      })
    );
    await page.goto('/');
    await expect(page.getByText('Image no longer available')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Original link' })).toHaveAttribute('href', url);
    await expect(page.getByRole('link', { name: 'Wayback Machine' })).toHaveAttribute('href', `https://web.archive.org/web/2/${url}`);
  });

  test('all time', async ({ page }) => {
    await page.goto('/?t=all');
    const titles = await feedTitles(page);
    expect(titles.slice(0, 3)).toEqual([FIXTURE.topPost.title, 'January winner', FIXTURE.laterPost.title]);
  });

  test('repeated range parameters fall back instead of crashing', async ({ page }) => {
    await page.goto('/?from=2010-01&from=2010-02&to=2011-01');
    await expect(page.getByText(FIXTURE.topPost.title)).toBeVisible();
  });

  test('sidebar lists top communities', async ({ page }) => {
    await page.goto('/');
    const card = page.locator('section', { hasText: 'Top communities' });
    await expect(card.getByRole('link', { name: /r\/reddit\.com/ })).toBeVisible();
  });

  test('explore by year links filter the feed', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: '2010', exact: true }).click();
    // Narrowed to the archived months of that year
    await expect(page).toHaveURL(/from=2010-06&to=2010-06/);
    await expect(page.getByText(FIXTURE.laterPost.title)).toBeVisible();
  });

  test('explore by year keeps the sort', async ({ page }) => {
    await page.goto('/?sort=new');
    await feedTitles(page);
    await page.getByRole('link', { name: '2010', exact: true }).click();
    await expect(page).toHaveURL(/from=2010-06&to=2010-06&sort=new/);
    await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  });
});

test.describe('Thread', () => {
  test('renders a self post with markdown', async ({ page }) => {
    await page.goto(`/Thread/${FIXTURE.selfPost.id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(FIXTURE.selfPost.title);
    await expect(page.locator('article strong', { hasText: 'bold' })).toBeVisible();
    await expect(page).toHaveTitle(`${FIXTURE.selfPost.title} : r/programming`);
  });

  test('shows the comment tree', async ({ page }) => {
    await page.goto(`/Thread/${FIXTURE.topPost.id}`);
    const comments = page.getByRole('region', { name: 'Comments' });
    await expect(comments.getByText('First top-level comment')).toBeVisible();
    await expect(comments.getByText('Nested reply')).toBeVisible();
    await expect(comments.getByText('Late comment from January')).toBeVisible();
    await expect(comments.getByText('OP', { exact: true })).toBeVisible();
  });

  test('sorts comments and marks controversial ones', async ({ page }) => {
    await page.goto(`/Thread/${FIXTURE.topPost.id}`);
    const comments = page.getByRole('region', { name: 'Comments' });
    await expect(comments.getByText('First top-level comment')).toBeVisible();
    await comments.getByRole('combobox').selectOption('new');
    await expect(comments.locator('[id^="t1_"]').first()).toContainText('Late comment from January');
    await comments.getByRole('combobox').selectOption('controversial');
    const first = comments.locator('[id^="t1_"]').first();
    await expect(first).toContainText('A divisive take');
    await expect(first.getByTitle(/Controversial/)).toBeVisible();
  });

  test('collapses a comment thread', async ({ page }) => {
    await page.goto(`/Thread/${FIXTURE.topPost.id}`);
    await page.getByRole('button', { name: 'Collapse comment thread' }).first().click();
    await expect(page.getByText('Nested reply')).toBeHidden();
    await page.getByRole('button', { name: 'Expand comment' }).click();
    await expect(page.getByText('Nested reply')).toBeVisible();
  });

  test('explains when comments are not archived', async ({ page }) => {
    await page.goto(`/Thread/${FIXTURE.laterPost.id}`);
    await expect(page.getByText("Comments aren't archived yet")).toBeVisible();
  });

  test('labels NSFW and locked posts', async ({ page }) => {
    await page.goto(`/Thread/${FIXTURE.nsfwPost.id}`);
    await expect(page.getByText('NSFW', { exact: true })).toBeVisible();
    await page.goto(`/Thread/${FIXTURE.lockedPost.id}`);
    await expect(page.getByText(/· locked/)).toBeVisible();
  });

  test('shows the comments of a post no archive has', async ({ page }) => {
    const response = await page.goto(`/Thread/${FIXTURE.missingPost.id}`);
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText("This post wasn't archived");
    await expect(page.locator('article').getByRole('link', { name: 'r/programming' })).toBeVisible();
    await expect(page.locator('article')).toContainText('Jan 2006');
    const comments = page.getByRole('region', { name: 'Comments' });
    await expect(comments.getByText('Comment on a post no archive has')).toBeVisible();
    await expect(comments.getByText('Reply under the missing post')).toBeVisible();
    // From rc_extra: recovered comments sit with the archived ones
    await expect(comments.getByText('Recovered reply from a saved page')).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page).toHaveTitle('Unarchived post : r/programming');
  });

  test('unknown posts are a 404', async ({ page }) => {
    const response = await page.goto('/Thread/zzzzzz');
    expect(response.status()).toBe(404);
    await expect(page.getByText("Hmm... we couldn't find that page")).toBeVisible();
  });
});

test.describe('Reddit-style URLs', () => {
  for (const path of ['/r/reddit.com/comments/b001/top_best_post', '/r/reddit.com/comments/b001', '/comments/b001']) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(FIXTURE.topPost.title);
    });
  }

  for (const path of ['/u/alice', '/user/alice', '/user/alice/submitted']) {
    test(path, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('alice');
    });
  }
});

test.describe('Community', () => {
  test('header, about card and feed', async ({ page }) => {
    await page.goto('/r/programming');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('r/programming');
    await expect(page.getByText('30 archived posts · Dec 2005 – Feb 2006')).toBeVisible();
    await expect(page.getByText('Programming!')).toBeVisible();
    await expect(page.getByText('200K')).toBeVisible();
    expect((await feedTitles(page))[0]).toBe('January winner');
  });

  test('icon is drawn above the banner', async ({ page }) => {
    await page.goto('/r/programming');
    const icon = page.locator('img[src*="SubredditIcons?subreddit=programming"][width="88"]');
    await expect(icon).toBeVisible();
    const box = await icon.boundingBox();
    // The top of the icon overlaps the banner; whatever is painted there must be the icon
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('src') || '',
      [box.x + box.width / 2, box.y + box.height * 0.2]
    );
    expect(hit).toContain('SubredditIcons?subreddit=programming');
  });

  test('sorts the community feed', async ({ page }) => {
    await page.goto('/r/programming?sort=comments');
    expect((await feedTitles(page))[0]).toBe(FIXTURE.selfPost.title);
    await page.getByRole('button', { name: 'Most comments' }).click();
    await page.getByRole('option', { name: 'New' }).click();
    await expect(page).toHaveURL(/\/r\/programming\?sort=new$/);
    await expect(page.locator('article h2, article h3').first()).toHaveText('February programming post');
  });

  test('canonicalises the name', async ({ page }) => {
    await page.goto('/r/PROGRAMMING');
    await expect(page).toHaveURL(/\/r\/programming$/);
  });

  test('banned community notice', async ({ page }) => {
    await page.goto('/r/GoneSub');
    await expect(page.getByText('This community was banned or made private')).toBeVisible();
  });

  test('unknown community', async ({ page }) => {
    await page.goto('/r/neverexisted');
    await expect(page.getByText('There are no archived posts for r/neverexisted')).toBeVisible();
  });
});

test.describe('User', () => {
  test('lists posts newest first with stats', async ({ page }) => {
    await page.goto('/User/alice');
    expect((await feedTitles(page))[0]).toBe(FIXTURE.laterPost.title);
    await expect(page.getByText('First post')).toBeVisible();
    await expect(page.getByText('Dec 10, 2005')).toBeVisible();
    await expect(page.getByText('Months with posts')).toBeVisible();
    await expect(page.getByText('Post karma')).toHaveCount(0);
  });

  test('top sort', async ({ page }) => {
    await page.goto('/User/alice?sort=top');
    expect((await feedTitles(page))[0]).toBe(FIXTURE.topPost.title);
  });

  test('old sort', async ({ page }) => {
    await page.goto('/User/alice?sort=old');
    expect((await feedTitles(page))[0]).toBe(FIXTURE.topPost.title);
    expect((await feedTitles(page))[1]).toBe('January winner');
  });
});

test.describe('Saved posts', () => {
  test('save from the feed, list on /saved, unsave', async ({ page }) => {
    await page.goto('/?from=2005-12&to=2005-12');
    const first = page.locator('article').first();
    await expect(first.getByRole('button', { name: 'Save' })).toBeVisible();
    await first.getByRole('button', { name: 'Save' }).click();
    await expect(first.getByRole('button', { name: 'Saved' })).toBeVisible();

    await page.getByRole('link', { name: 'Saved', exact: true }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByText(FIXTURE.topPost.title)).toBeVisible();
    await page.reload();
    await expect(page.getByText(FIXTURE.topPost.title)).toBeVisible();

    await page.getByRole('button', { name: 'Saved' }).click();
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
  });

  test('save from a thread', async ({ page }) => {
    await page.goto(`/Thread/${FIXTURE.selfPost.id}`);
    await page.getByRole('button', { name: 'Save' }).click();
    await page.goto('/saved');
    await expect(page.getByText(FIXTURE.selfPost.title)).toBeVisible();
  });
});

test.describe('Keyboard shortcuts', () => {
  test('j/k select posts, s saves, o opens, ? shows help', async ({ page }) => {
    await page.goto('/?from=2005-12&to=2005-12');
    await feedTitles(page);
    const articles = page.locator('article');
    await page.keyboard.press('j');
    await expect(articles.nth(0)).toHaveAttribute('data-kb-selected', '');
    await page.keyboard.press('j');
    await expect(articles.nth(1)).toHaveAttribute('data-kb-selected', '');
    await expect(articles.nth(0)).not.toHaveAttribute('data-kb-selected', '');
    await page.keyboard.press('k');
    await page.keyboard.press('j');
    await page.keyboard.press('s');
    await expect(articles.nth(1).getByRole('button', { name: 'Saved' })).toBeVisible();

    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    await page.keyboard.press('j');
    await page.keyboard.press('o');
    await expect(page).toHaveURL(/\/Thread\//);
  });

  test('/ focuses the search box and typing there is not a shortcut', async ({ page }) => {
    await page.goto('/');
    await feedTitles(page);
    await page.keyboard.press('/');
    const search = page.getByRole('combobox');
    await expect(search).toBeFocused();
    await page.keyboard.type('jk');
    await expect(search).toHaveValue('jk');
    await expect(page.locator('article[data-kb-selected]')).toHaveCount(0);
  });
});

test.describe('Random post', () => {
  test('the nav link opens a thread', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Random post' }).first().click();
    await expect(page).toHaveURL(/\/Thread\/[0-9a-z]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('the community button stays in the community', async ({ page }) => {
    await page.goto('/r/programming');
    await page.locator('a[href="/random?subreddit=programming"]').click();
    await expect(page).toHaveURL(/\/Thread\/[0-9a-z]+$/);
    await expect(page.getByRole('link', { name: 'r/programming' }).first()).toBeVisible();
  });
});

test.describe('Server-rendered feeds', () => {
  // Crawlers that don't run scripts still see the posts
  const htmlTitles = async (request, url) => {
    const html = await (await request.get(url)).text();
    return [...html.matchAll(/<a href="\/Thread\/\w+">([^<]+)<\/a><\/h3>/g)].map((m) => m[1]);
  };

  test('community pages include their first page of posts in the URL sort', async ({ request }) => {
    const top = await htmlTitles(request, '/r/programming');
    expect(top[0]).toBe('January winner');
    expect(top).toHaveLength(15);
    expect((await htmlTitles(request, '/r/programming?sort=comments'))[0]).toBe('What is &lt;markdown&gt;?');
  });

  test('profiles include their first page of posts in the URL sort', async ({ request }) => {
    expect(await htmlTitles(request, '/User/alice')).toEqual([
      FIXTURE.laterPost.title,
      'February programming post',
      'January winner',
      'Top &amp; best post of December',
    ]);
    expect((await htmlTitles(request, '/User/alice?sort=top'))[0]).toBe('Top &amp; best post of December');
  });

  test('the browser does not fetch the server-rendered page again', async ({ page }) => {
    const firstPages = [];
    page.on('request', (r) => r.url().includes('/api/Posts') && r.url().includes('page=1&') && firstPages.push(r.url()));
    await page.goto('/r/programming');
    expect((await feedTitles(page))[0]).toBe('January winner');
    expect(firstPages).toEqual([]);
  });
});

test.describe('Community history', () => {
  test('chart shows posts per month and a bar opens that month', async ({ page }) => {
    await page.goto('/r/programming');
    const card = page.locator('section', { hasText: 'Posts per month' });
    await expect(card.getByText('Busiest: Dec 2005 with 15 posts')).toBeVisible();
    await card.locator('svg g').nth(1).click();
    await expect(page).toHaveURL(/from=2006-01&to=2006-01/);
    await expect(page.locator('article h2, article h3').first()).toHaveText('January winner');
  });
});

test.describe('Search', () => {
  test('suggests communities and opens them', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('combobox').fill('prog');
    await page.getByRole('option', { name: /r\/programming/ }).click();
    await expect(page).toHaveURL(/\/r\/programming$/);
  });
});

test.describe('Theme', () => {
  test('dark mode toggles and persists', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const start = await html.getAttribute('data-theme');
    const next = start === 'dark' ? 'light' : 'dark';
    await page.getByRole('button', { name: `Switch to ${next} mode` }).click();
    await expect(html).toHaveAttribute('data-theme', next);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', next);
  });
});

// Checked in the server's HTML, before any script runs, as a crawler first sees it
test.describe('Analytics', () => {
  test('pages load the tracker, which only reports from the live site', async ({ request }) => {
    const html = await (await request.get('/')).text();
    const tag = /<script[^>]*src="\/stats\/script\.js"[^>]*>/.exec(html)?.[0];
    expect(tag).toContain('data-website-id=');
    expect(tag).toContain('data-domains="redditrebuilt.com"');
  });

  test('missing pages and communities work without the tracker', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/no/such/page');
    await expect(page.getByText("we couldn't find that page")).toBeVisible();
    await page.goto('/r/NoSuchCommunityAtAll');
    await expect(page.getByText('There are no archived posts for r/NoSuchCommunityAtAll')).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('Search engine markup', () => {
  const canonical = (html) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  // The origin is SITE_URL as built; the path is what matters
  const path = (url) => new URL(url).pathname;

  test('every page type names its canonical URL', async ({ request }) => {
    const pages = {
      '/?sort=new&from=2006-01': '/',
      '/r/programming?sort=controversial': '/r/programming',
      '/User/alice?sort=top': '/User/alice',
      [`/Thread/${FIXTURE.selfPost.id}`]: `/Thread/${FIXTURE.selfPost.id}`,
    };
    for (const [url, expected] of Object.entries(pages)) {
      expect(path(canonical(await (await request.get(url)).text())), url).toBe(expected);
    }
  });

  test('threads carry DiscussionForumPosting data', async ({ request }) => {
    const html = await (await request.get(`/Thread/${FIXTURE.selfPost.id}`)).text();
    const json = /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(html)?.[1];
    const data = JSON.parse(json);
    expect(data['@type']).toBe('DiscussionForumPosting');
    expect(data.headline).toBe(FIXTURE.selfPost.title);
    expect(path(data.url)).toBe(`/Thread/${FIXTURE.selfPost.id}`);
    expect(data.text).toContain('bold');
    expect(path(data.isPartOf.url)).toBe('/r/programming');
    expect(data.interactionStatistic.map((s) => s.interactionType)).toEqual([
      'https://schema.org/LikeAction', 'https://schema.org/CommentAction',
    ]);
    // The title's "<" is escaped, so post text can't end the script element
    expect(json).not.toContain('<markdown>');
  });

  test('threads carry their first comments, nested', async ({ request }) => {
    const html = await (await request.get(`/Thread/${FIXTURE.topPost.id}`)).text();
    const data = JSON.parse(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(html)[1]);
    const texts = (comments) => (comments || []).flatMap((c) => [c.text, ...texts(c.comment)]);
    expect(texts(data.comment)).toEqual(expect.arrayContaining(['First top-level comment', 'Nested reply']));
    const first = data.comment.find((c) => c.text === 'First top-level comment');
    expect(first['@type']).toBe('Comment');
    expect(first.comment.map((c) => c.text)).toContain('Reply from OP');
    expect(texts(first.comment)).toContain('Nested reply');
  });
});

test('unknown pages are a 404', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response.status()).toBe(404);
});
