import { test, expect, FIXTURE } from './fixtures';

test('navigation drawer is hidden until opened', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).not.toBeInViewport();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(nav).toBeInViewport();
});

test('feed fits the screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(FIXTURE.topPost.title)).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('community icon stays above the banner', async ({ page }) => {
  await page.goto('/r/programming');
  const icon = page.locator('img[src*="SubredditIcons?subreddit=programming"][width="88"]');
  const box = await icon.boundingBox();
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.getAttribute('src') || '',
    [box.x + box.width / 2, box.y + box.height * 0.2]
  );
  expect(hit).toContain('SubredditIcons?subreddit=programming');
});

test('thread page fits the screen', async ({ page }) => {
  await page.goto(`/Thread/${FIXTURE.selfPost.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
