import { describe, expect, it } from 'vitest';
import { archivedPath, linkTarget } from '@/lib/links';

describe('linkTarget', () => {
  it('points Reddit threads, communities and users at their archived copies', () => {
    expect(linkTarget('https://www.reddit.com/r/pics/comments/ABC12/title/')).toEqual({ local: '/Thread/abc12' });
    expect(linkTarget('/r/pics/comments/abc12/')).toEqual({ local: '/Thread/abc12' });
    expect(linkTarget('https://old.reddit.com/r/pics/')).toEqual({ local: '/r/pics' });
    expect(linkTarget('/r/pics')).toEqual({ local: '/r/pics' });
    expect(linkTarget('/r/u_Far-Glass/')).toEqual({ local: '/r/u_Far-Glass' });
    expect(linkTarget('/u/spez')).toEqual({ local: '/User/spez' });
    expect(linkTarget('https://reddit.com/user/spez/')).toEqual({ local: '/User/spez' });
  });

  it('sends other host-less paths to Reddit, where they were written for', () => {
    expect(linkTarget('/message/compose?to=%2Fr%2Fkorea')).toEqual({
      href: 'https://www.reddit.com/message/compose?to=%2Fr%2Fkorea',
    });
    expect(linkTarget('/r/korea/wiki')).toEqual({ href: 'https://www.reddit.com/r/korea/wiki' });
    expect(linkTarget('/r/CostaRicaTravel/search?q=driving&restrict_sr=on')).toEqual({
      href: 'https://www.reddit.com/r/CostaRicaTravel/search?q=driving&restrict_sr=on',
    });
    expect(linkTarget('/SB50')).toEqual({ href: 'https://www.reddit.com/SB50' });
  });

  it('keeps links to other sites and anchors', () => {
    expect(linkTarget('https://example.com/x')).toEqual({ href: 'https://example.com/x' });
    expect(linkTarget('//example.com/x')).toEqual({ href: 'https://example.com/x' });
    expect(linkTarget('mailto:a@example.com')).toEqual({ href: 'mailto:a@example.com' });
    expect(linkTarget('#section')).toEqual({ href: '#section' });
  });

  it('drops relative links, which would resolve against this site', () => {
    expect(linkTarget('you have a g3 flat, use g3 mags')).toBeNull();
    expect(linkTarget('www.example.com')).toBeNull();
    expect(linkTarget('')).toBeNull();
  });
});

describe('archivedPath', () => {
  it('finds the archived thread for any form of Reddit thread link', () => {
    for (const link of [
      'https://www.reddit.com/r/AskReddit/comments/ABC12/what_is/',
      'https://old.reddit.com/r/AskReddit/comments/abc12/what_is/def34/?context=3',
      'reddit.com/r/AskReddit/comments/abc12',
      'https://np.reddit.com/comments/abc12',
      'https://redd.it/abc12',
      'redd.it/abc12',
      'https://redditrebuilt.com/Thread/abc12',
      '  https://m.reddit.com/r/AskReddit/comments/abc12/what_is/?utm_source=share  ',
    ]) {
      expect(archivedPath(link), link).toBe('/Thread/abc12');
    }
  });

  it('finds communities and users', () => {
    expect(archivedPath('https://www.reddit.com/r/pics/')).toBe('/r/pics');
    expect(archivedPath('https://www.reddit.com/r/pics/top/?t=all')).toBe('/r/pics');
    expect(archivedPath('https://www.reddit.com/user/spez/submitted/')).toBe('/User/spez');
    expect(archivedPath('reddit.com/u/spez')).toBe('/User/spez');
  });

  it('refuses links only Reddit can resolve and anything that is not Reddit', () => {
    expect(archivedPath('https://www.reddit.com/r/pics/s/aBcDeF123')).toBe(null);
    expect(archivedPath('https://notreddit.com/r/pics/comments/abc12')).toBe(null);
    expect(archivedPath('https://example.com')).toBe(null);
    expect(archivedPath('')).toBe(null);
  });
});
