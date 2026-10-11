import { describe, expect, it } from 'vitest';
import { decodeEntities, timeAgo, fullDate, monthLabel, formatCount, getMedia, thumbnailUrl } from '@/lib/format';

describe('decodeEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39; &#x41;')).toBe('Tom & Jerry <3 "hi" \'x\' A');
  });

  it('decodes one level only', () => {
    expect(decodeEntities('&amp;gt;')).toBe('&gt;');
  });

  it('leaves unknown or invalid entities alone', () => {
    expect(decodeEntities('&bogus; &#0; &#x110000;')).toBe('&bogus; &#0; &#x110000;');
  });

  it('passes through empty values', () => {
    expect(decodeEntities('')).toBe('');
    expect(decodeEntities(null)).toBe(null);
  });
});

describe('timeAgo', () => {
  const now = Date.UTC(2026, 0, 1) ;
  const ago = (seconds) => timeAgo(now / 1000 - seconds, now);

  it.each([
    [10, 'just now'],
    [5 * 60, '5 min. ago'],
    [3 * 3600, '3 hr. ago'],
    [86400, '1 day ago'],
    [5 * 86400, '5 days ago'],
    [90 * 86400, '2 mo. ago'],
    [20 * 365.25 * 86400, '20 yr. ago'],
  ])('%i seconds -> %s', (seconds, expected) => {
    expect(ago(seconds)).toBe(expected);
  });

  it('never goes negative', () => {
    expect(timeAgo(now / 1000 + 100, now)).toBe('just now');
  });

  it('is empty without a timestamp', () => {
    expect(timeAgo(0, now)).toBe('');
  });
});

describe('fullDate', () => {
  it('formats in UTC', () => {
    expect(fullDate(1134172800)).toBe('Dec 10, 2005, 12:00 AM UTC');
  });
});

describe('monthLabel', () => {
  it('formats YYYY-MM', () => {
    expect(monthLabel('2005-06')).toBe('Jun 2005');
    expect(monthLabel('2026-12')).toBe('Dec 2026');
    expect(monthLabel(null)).toBe('');
  });
});

describe('formatCount', () => {
  it.each([
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [1500, '1.5K'],
    [12345, '12K'],
    [999999, '1000K'],
    [1000000, '1M'],
    [27541590, '27.5M'],
    [-2500, '-2.5K'],
  ])('%i -> %s', (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });

  it('is empty for missing values', () => {
    expect(formatCount(null)).toBe('');
    expect(formatCount(undefined)).toBe('');
  });
});

describe('getMedia', () => {
  const link = (url, extra = {}) => getMedia({ url, is_self: false, ...extra });

  it('ignores self posts and bad urls', () => {
    expect(getMedia({ url: 'https://i.redd.it/a.jpg', is_self: true })).toBe(null);
    expect(link('not a url')).toBe(null);
    expect(link('javascript:alert(1)')).toBe(null);
    expect(link(null)).toBe(null);
  });

  it('routes imgur images through the archive', () => {
    expect(link('https://i.imgur.com/abcde12.jpg')).toEqual({ type: 'image', src: '/api/ImgurImages?id=abcde12.jpg' });
    expect(link('https://imgur.com/abcde12')).toEqual({ type: 'image', src: '/api/ImgurImages?id=abcde12' });
  });

  it('plays imgur gifv as video', () => {
    expect(link('https://i.imgur.com/abcde12.gifv')).toMatchObject({ type: 'video', src: 'https://i.imgur.com/abcde12.mp4' });
  });

  it('treats imgur albums as links', () => {
    expect(link('https://imgur.com/a/abcde12')).toEqual({ type: 'link', host: 'imgur.com' });
  });

  it('embeds youtube', () => {
    expect(link('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ type: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(link('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ type: 'youtube', id: 'dQw4w9WgXcQ' });
    expect(link('https://www.youtube.com/watch?v=<script>')).toEqual({ type: 'link', host: 'youtube.com' });
  });

  it('shows direct images', () => {
    expect(link('https://i.redd.it/abc')).toEqual({ type: 'image', src: 'https://i.redd.it/abc' });
    expect(link('https://example.com/pic.PNG?x=1')).toEqual({ type: 'image', src: 'https://example.com/pic.PNG?x=1' });
  });

  it('falls back to a link card', () => {
    expect(link('https://www.example.com/article')).toEqual({ type: 'link', host: 'example.com' });
  });
});

describe('thumbnailUrl', () => {
  it('only accepts http(s) thumbnails', () => {
    expect(thumbnailUrl({ thumbnail: 'https://b.thumbs.redditmedia.com/x.jpg' })).toBe('https://b.thumbs.redditmedia.com/x.jpg');
    expect(thumbnailUrl({ thumbnail: 'default' })).toBe(null);
    expect(thumbnailUrl({ thumbnail: 'self' })).toBe(null);
    expect(thumbnailUrl({})).toBe(null);
  });
});
