import { describe, expect, it } from 'vitest';
import { batchBounds, indexPageCount, SITEMAPS_PER_INDEX } from '@/lib/sitemap';
import { SITEMAP_BATCH_SIZE } from '@/lib/site';

describe('batchBounds', () => {
  it('splits a month into blocks of consecutive ids', () => {
    const min = 10000000; // five base-36 digits, as are the next two batches
    const range = { min, max: min + 2 * SITEMAP_BATCH_SIZE };
    expect(batchBounds(range, 1)).toEqual([[min.toString(36), (min + SITEMAP_BATCH_SIZE - 1).toString(36)]]);
    expect(batchBounds(range, 3)).toEqual([[range.max.toString(36), range.max.toString(36)]]);
    expect(batchBounds(range, 4)).toBe(null);
    expect(batchBounds(range, 0)).toBe(null);
  });

  it('splits a batch where ids gain a character', () => {
    const first7 = 36 ** 6; // '1000000'
    const bounds = batchBounds({ min: first7 - 5, max: first7 + 100 }, 1);
    expect(bounds).toEqual([
      [(first7 - 5).toString(36), 'zzzzzz'],
      ['1000000', (first7 + 100).toString(36)],
    ]);
  });
});

describe('batchBounds with stragglers', () => {
  // Numbered batches start after the previous month; batch 0 is the rest
  const range = { min: 10000000, start: 20000000, max: 20000000 + SITEMAP_BATCH_SIZE };

  it('numbers batches from the start', () => {
    expect(batchBounds(range, 1)[0][0]).toBe((20000000).toString(36));
    expect(batchBounds(range, 2)).toEqual([[range.max.toString(36), range.max.toString(36)]]);
  });

  it('puts ids before the start in batch 0', () => {
    expect(batchBounds(range, 0)).toEqual([[(10000000).toString(36), (19999999).toString(36)]]);
    expect(batchBounds({ min: 5, start: 5, max: 9 }, 0)).toBe(null);
  });
});

describe('indexPageCount', () => {
  it('needs one index page per SITEMAPS_PER_INDEX batches', () => {
    expect(indexPageCount(0)).toBe(1);
    expect(indexPageCount(SITEMAPS_PER_INDEX)).toBe(1);
    expect(indexPageCount(SITEMAPS_PER_INDEX + 1)).toBe(2);
    expect(SITEMAPS_PER_INDEX).toBeLessThanOrEqual(50000);
  });
});
