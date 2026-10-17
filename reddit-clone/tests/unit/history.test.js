import { describe, expect, it } from 'vitest';
import { fillMonths } from '@/lib/range';

describe('fillMonths', () => {
  it('fills the months without posts, across years', () => {
    expect(fillMonths([{ month: '2005-11', posts: 3 }, { month: '2006-02', posts: 1 }])).toEqual([
      { month: '2005-11', posts: 3 },
      { month: '2005-12', posts: 0 },
      { month: '2006-01', posts: 0 },
      { month: '2006-02', posts: 1 },
    ]);
  });

  it('handles empty and single-month histories', () => {
    expect(fillMonths([])).toEqual([]);
    expect(fillMonths([{ month: '2010-06', posts: 5 }])).toEqual([{ month: '2010-06', posts: 5 }]);
  });
});
