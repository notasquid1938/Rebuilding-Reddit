import { test, expect, FIXTURE } from './fixtures';

// The thread page's back arrow returns to the previous page of the site, or
// to the post's community when the visitor arrived on the thread directly.
const openThread = async (page) => {
  await page.locator(`a[href="/Thread/${FIXTURE.topPost.id}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/Thread/${FIXTURE.topPost.id}$`));
};
const backArrow = (page) => page.getByRole('button', { name: 'Go back' }).click();

test('home -> thread -> back returns home', async ({ page }) => {
  await page.goto('/');
  await openThread(page);
  await backArrow(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(FIXTURE.topPost.title)).toBeVisible();
});

test('community -> thread -> back returns to the community', async ({ page }) => {
  await page.goto('/r/reddit.com');
  await openThread(page);
  await backArrow(page);
  await expect(page).toHaveURL(/\/r\/reddit\.com$/);
});

test('back still works after reloading the thread', async ({ page }) => {
  await page.goto('/?t=all');
  await openThread(page);
  await page.reload();
  await backArrow(page);
  await expect(page).toHaveURL(/\/\?t=all$/);
});

test('arriving directly on a thread goes to its community', async ({ page }) => {
  await page.goto(`/Thread/${FIXTURE.topPost.id}`);
  await backArrow(page);
  await expect(page).toHaveURL(/\/r\/reddit\.com$/);
});

test('never leaves the site after returning to the landing thread', async ({ page }) => {
  await page.goto(`/Thread/${FIXTURE.topPost.id}`);
  await page.getByRole('link', { name: 'r/reddit.com', exact: true }).first().click();
  await expect(page).toHaveURL(/\/r\/reddit\.com$/);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/Thread/${FIXTURE.topPost.id}$`));
  await backArrow(page);
  await expect(page).toHaveURL(/\/r\/reddit\.com$/);
});

test('feed is restored from cache when going back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('article')).toHaveCount(15);
  await page.mouse.wheel(0, 20000);
  await expect(page.locator('article')).toHaveCount(30);
  await openThread(page);
  await page.goBack();
  await expect(page.locator('article')).toHaveCount(30);
});
