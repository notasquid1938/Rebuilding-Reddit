import { describe, expect, it } from 'vitest';
import {
  selectColumns, normalizePost, normalizeComment, tablesInRange, isMonth, SUBREDDIT_RE, AUTHOR_RE, ID_RE,
} from '@/lib/submissions';

const table = (month, columns) => ({ name: `rs_${month.replace('-', '_')}`, month, columns: new Set(columns) });

describe('selectColumns', () => {
  it('substitutes NULL for columns a month lacks', () => {
    const sql = selectColumns(table('2017-09', ['id', 'title']), ['id', 'subreddit']);
    expect(sql).toBe('"id"::text AS "id", NULL::text AS "subreddit"');
  });

  it('uses the custom expression for computed columns', () => {
    const col = { name: 'score', sql: (t) => (t.columns.has('score') ? '"score"' : 'NULL::numeric') };
    expect(selectColumns(table('2010-01', ['score']), [col])).toBe('"score" AS "score"');
    expect(selectColumns(table('2010-01', []), [col])).toBe('NULL::numeric AS "score"');
  });
});

describe('tablesInRange', () => {
  const tables = ['2005-12', '2006-01', '2006-02', '2010-06'].map((m) => table(m, []));
  const months = (list) => list.map((t) => t.month);

  it('filters inclusively', () => {
    expect(months(tablesInRange(tables, '2006-01', '2006-02'))).toEqual(['2006-01', '2006-02']);
  });

  it('treats missing or invalid bounds as open', () => {
    expect(months(tablesInRange(tables, undefined, '2006-01'))).toEqual(['2005-12', '2006-01']);
    expect(months(tablesInRange(tables, 'garbage', undefined))).toHaveLength(4);
  });
});

describe('normalizePost', () => {
  const row = {
    id: 'b001', author: 'alice', subreddit: 'pics', title: 'Hi', url: 'https://x', domain: 'x', score: '5000',
    num_comments: '12', created_utc: '1134172800', is_self: 'False', over_18: 'True', spoiler: 'true',
    stickied: 'False', link_flair_text: 'None', thumbnail: '', distinguished: null, selftext: 'body',
  };

  it('converts text columns to typed values', () => {
    expect(normalizePost(row)).toMatchObject({
      score: 5000, num_comments: 12, created_utc: 1134172800, is_self: false, over_18: true, spoiler: true,
      flair: null, thumbnail: null, distinguished: null, selftext: 'body',
    });
  });

  it('marks missing authors deleted and missing subreddits null', () => {
    expect(normalizePost({ ...row, author: 'None', subreddit: '' })).toMatchObject({ author: '[deleted]', subreddit: null });
  });

  it('defaults unusable numbers to 0', () => {
    expect(normalizePost({ ...row, score: 'NaN', num_comments: null }).score).toBe(0);
  });

  it('only reports locked/edited when selected', () => {
    expect(normalizePost(row)).not.toHaveProperty('locked');
    expect(normalizePost({ ...row, locked: 'True', edited: 'False' })).toMatchObject({ locked: true, edited: false });
    expect(normalizePost({ ...row, edited: '1134100000' }).edited).toBe(1134100000);
    expect(normalizePost({ ...row, edited: 'True' }).edited).toBe(true);
  });
});

describe('normalizeComment', () => {
  it('normalises', () => {
    expect(normalizeComment({ id: 'k1', parent_id: 't3_b001', author: null, body: null, score: '7', stickied: 'True' }))
      .toMatchObject({ author: '[deleted]', body: '', score: 7, stickied: true });
  });
});

describe('input validation', () => {
  it('accepts real names and rejects injection attempts', () => {
    expect(isMonth('2005-06')).toBe(true);
    expect(isMonth('2005-6')).toBe(false);
    expect(isMonth(undefined)).toBe(false);
    expect(SUBREDDIT_RE.test('reddit.com')).toBe(true);
    expect(SUBREDDIT_RE.test('a"; DROP TABLE x')).toBe(false);
    expect(AUTHOR_RE.test('some-user_1')).toBe(true);
    expect(AUTHOR_RE.test('[deleted]')).toBe(false);
    expect(ID_RE.test('b001')).toBe(true);
    expect(ID_RE.test('b0 01')).toBe(false);
  });
});
