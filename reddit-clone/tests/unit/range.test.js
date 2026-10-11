import { describe, expect, it } from 'vitest';
import { rangeFromQuery, rangeToQuery } from '@/lib/range';
import { DEFAULT_RANGE } from '@/lib/site';

describe('rangeFromQuery', () => {
  it('reads from/to', () => {
    expect(rangeFromQuery({ from: '2010-01', to: '2010-12' }, DEFAULT_RANGE)).toEqual({ from: '2010-01', to: '2010-12' });
  });

  it('swaps a reversed range', () => {
    expect(rangeFromQuery({ from: '2012-05', to: '2010-01' }, null)).toEqual({ from: '2010-01', to: '2012-05' });
  });

  it('treats t=all as no range', () => {
    expect(rangeFromQuery({ t: 'all', from: '2010-01', to: '2010-02' }, DEFAULT_RANGE)).toBe(null);
  });

  it('falls back on missing or malformed months', () => {
    expect(rangeFromQuery({}, DEFAULT_RANGE)).toBe(DEFAULT_RANGE);
    expect(rangeFromQuery({ from: '2010-1', to: '2010-12' }, DEFAULT_RANGE)).toBe(DEFAULT_RANGE);
    expect(rangeFromQuery({ from: '2010-01' }, null)).toBe(null);
    expect(rangeFromQuery({ from: ['2010-01'], to: '2010-02' }, null)).toBe(null);
  });
});

describe('rangeToQuery', () => {
  it('round-trips', () => {
    const range = { from: '2008-03', to: '2009-04' };
    expect(rangeFromQuery(rangeToQuery(range), null)).toEqual(range);
    expect(rangeToQuery(null)).toEqual({ t: 'all' });
  });
});
