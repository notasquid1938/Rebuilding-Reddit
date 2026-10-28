import { test as base, expect } from '@playwright/test';

// Every browser test also fails on uncaught exceptions, console errors (React
// hydration mismatches, failed renders) and 5xx responses from the site.
export const test = base.extend({
  pageProblems: [
    async ({ page, baseURL }, use) => {
      const problems = [];
      page.on('pageerror', (error) => problems.push(`uncaught: ${error.message}`));
      page.on('console', (message) => {
        // 404s for deliberately missing pages/images are checked by the tests themselves
        if (message.type() === 'error' && !message.text().startsWith('Failed to load resource')) {
          problems.push(`console: ${message.text()}`);
        }
      });
      page.on('response', (response) => {
        if (response.url().startsWith(baseURL) && response.status() >= 500) {
          problems.push(`HTTP ${response.status()} ${response.url()}`);
        }
      });
      await use(problems);
      expect(problems, 'browser errors during the test').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

// Named fixture records (tests/fixtures/build_fixtures.py)
export const FIXTURE = {
  months: ['2005-12', '2006-01', '2006-02', '2010-06'],
  topPost: { id: 'b001', title: 'Top & best post of December', subreddit: 'reddit.com', author: 'alice' },
  selfPost: { id: 'b002', title: 'What is <markdown>?' },
  nsfwPost: { id: 'b003', title: 'NSFW spoiler post' },
  lockedPost: { id: 'b005' },
  laterPost: { id: 'e001', title: 'History question from 2010', subreddit: 'AskHistory' },
  // Only its comments were archived
  missingPost: { id: 'c0zz', subreddit: 'programming', month: '2006-01' },
  postsInDefaultRange: 45 + 32 + 11,
};
