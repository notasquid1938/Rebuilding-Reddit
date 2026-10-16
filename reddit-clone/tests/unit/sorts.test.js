import { describe, expect, it } from 'vitest';
import { FEED_SORTS, SORT_LABELS, USER_SORTS, COMMENT_SORTS, isSort, isCommentSort, sortFromQuery, withSort } from '@/lib/sorts';

describe('sorts', () => {
  it('labels every sort', () => {
    for (const sort of [...FEED_SORTS, ...USER_SORTS, ...COMMENT_SORTS]) expect(SORT_LABELS[sort]).toBeTruthy();
  });

  it('validates sort names', () => {
    expect(isSort('controversial')).toBe(true);
    expect(isSort('hot')).toBe(false);
    expect(isSort(['top'])).toBe(false);
    expect(isCommentSort('old')).toBe(true);
    expect(isCommentSort('comments')).toBe(false);
  });

  it('reads the sort from the URL with a fallback', () => {
    expect(sortFromQuery({ sort: 'new' }, 'top')).toBe('new');
    expect(sortFromQuery({}, 'top')).toBe('top');
    expect(sortFromQuery({ sort: ['new', 'old'] }, 'top')).toBe('top');
    expect(sortFromQuery({ sort: 'bogus' }, 'new', USER_SORTS)).toBe('new');
  });

  it('keeps the default sort out of the URL', () => {
    expect(withSort({ from: '2010-01', to: '2010-02', sort: 'new' }, 'top', 'top')).toEqual({ from: '2010-01', to: '2010-02' });
    expect(withSort({ t: 'all' }, 'controversial', 'top')).toEqual({ t: 'all', sort: 'controversial' });
  });
});
