import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCache, sizeOf } from '@/lib/cache';
import { monthFromNumber } from '@/lib/submissions';

afterEach(() => vi.useRealTimers());

const counter = (value) => {
  const load = vi.fn(async () => (typeof value === 'function' ? value() : value));
  return load;
};

describe('query cache', () => {
  it('serves a result from memory until it expires', async () => {
    vi.useFakeTimers();
    const cache = createCache({ maxBytes: 1e6 });
    const load = counter(['a']);
    expect(await cache.cached('k', 1000, load)).toEqual(['a']);
    expect(await cache.cached('k', 1000, load)).toEqual(['a']);
    expect(load).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1001);
    await cache.cached('k', 1000, load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('runs one query for concurrent requests', async () => {
    const cache = createCache({ maxBytes: 1e6 });
    let release;
    const load = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    const requests = [1, 2, 3].map(() => cache.cached('k', 1000, load));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release('done');
    expect(await Promise.all(requests)).toEqual(['done', 'done', 'done']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves the expired result when a refresh fails', async () => {
    vi.useFakeTimers();
    const cache = createCache({ maxBytes: 1e6 });
    await cache.cached('k', 1000, counter('old'));
    vi.advanceTimersByTime(1001);
    const failing = vi.fn(async () => { throw new Error('busy'); });
    expect(await cache.cached('k', 1000, failing)).toBe('old');
  });

  it('does not cache errors', async () => {
    const cache = createCache({ maxBytes: 1e6 });
    await expect(cache.cached('k', 1000, async () => { throw new Error('busy'); })).rejects.toThrow('busy');
    expect(await cache.cached('k', 1000, counter('ok'))).toBe('ok');
  });

  it('drops the least recently used results to stay under its size', async () => {
    const value = 'x'.repeat(1000);
    // Room for exactly ten results (keys are one character)
    const cache = createCache({ maxBytes: 10 * (sizeOf(value) + 2) });
    const keys = 'abcdefghij'.split('');
    for (const key of keys) await cache.cached(key, 1e6, counter(value));
    await cache.cached('a', 1e6, counter(value)); // a is now the most recently used
    await cache.cached('k', 1e6, counter(value)); // evicts b
    expect(cache.stats().entries).toBe(10);
    expect(cache.stats().bytes).toBeLessThanOrEqual(cache.stats().maxBytes);
    const reload = counter(value);
    await cache.cached('a', 1e6, reload);
    expect(reload).not.toHaveBeenCalled();
    await cache.cached('b', 1e6, reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not store a result bigger than a tenth of the cache', async () => {
    const cache = createCache({ maxBytes: 10000 });
    const load = counter('x'.repeat(2000));
    await cache.cached('k', 1e6, load);
    await cache.cached('k', 1e6, load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.stats().entries).toBe(0);
  });

  it('takes the lifetime from the result when given a function', async () => {
    vi.useFakeTimers();
    const cache = createCache({ maxBytes: 1e6 });
    const ttl = (value) => (value ? 10000 : 100);
    const missing = counter(null);
    await cache.cached('missing', ttl, missing);
    vi.advanceTimersByTime(101);
    await cache.cached('missing', ttl, missing);
    expect(missing).toHaveBeenCalledTimes(2);
    const found = counter({ id: 'x' });
    await cache.cached('found', ttl, found);
    vi.advanceTimersByTime(101);
    await cache.cached('found', ttl, found);
    expect(found).toHaveBeenCalledTimes(1);
  });

  it('is turned off by a zero size', async () => {
    const cache = createCache({ maxBytes: 0 });
    const load = counter('x');
    await cache.cached('k', 1e6, load);
    await cache.cached('k', 1e6, load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('monthFromNumber', () => {
  it('matches month_number() in site_tables.sql (months from 2005-01)', () => {
    expect(monthFromNumber(0)).toBe('2005-01');
    expect(monthFromNumber(5)).toBe('2005-06');
    expect(monthFromNumber(12)).toBe('2006-01');
    expect(monthFromNumber(257)).toBe('2026-06');
  });
});
