import { describe, expect, it } from 'vitest';
import { linkTarget } from '@/lib/links';

describe('linkTarget', () => {
  it('points Reddit threads, communities and users at their archived copies', () => {
    expect(linkTarget('https://www.reddit.com/r/pics/comments/ABC12/title/')).toEqual({ local: '/Thread/abc12' });
    expect(linkTarget('/r/pics/comments/abc12/')).toEqual({ local: '/Thread/abc12' });
    expect(linkTarget('https://old.reddit.com/r/pics/')).toEqual({ local: '/r/pics' });
    expect(linkTarget('/r/pics')).toEqual({ local: '/r/pics' });
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
