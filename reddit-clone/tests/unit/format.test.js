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
    const player = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1';
    expect(link('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({
      type: 'embed', provider: 'youtube', src: player, thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    });
    expect(link('https://youtu.be/dQw4w9WgXcQ')).toMatchObject({ src: player });
    expect(link('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toMatchObject({ src: player });
    expect(link('https://m.youtube.com/watch?feature=share&amp;v=dQw4w9WgXcQ')).toMatchObject({ src: player });
    expect(link('https://youtu.be/dQw4w9WgXcQ?t=1m30s')).toMatchObject({ src: `${player}&start=90` });
    expect(link('https://www.youtube.com/watch?v=<script>')).toEqual({ type: 'link', host: 'youtube.com' });
  });

  it("plays Reddit's own videos", () => {
    expect(link('https://v.redd.it/i6kquezsgg591')).toEqual({ type: 'redditVideo', id: 'i6kquezsgg591', host: 'v.redd.it' });
    expect(link('https://v.redd.it/i6kquezsgg591/DASH_480.mp4')).toMatchObject({ id: 'i6kquezsgg591' });
  });

  it('embeds RedGIFs, including its stills, in a portrait frame', () => {
    const clip = { type: 'embed', provider: 'redgifs', src: 'https://www.redgifs.com/ifr/klutzyconsciouspekingese', frame: 'tall', play: false };
    expect(link('https://www.redgifs.com/watch/klutzyconsciouspekingese')).toMatchObject(clip);
    expect(link('https://v3.redgifs.com/watch/KlutzyConsciousPekingese')).toMatchObject(clip);
    expect(link('https://i.redgifs.com/i/klutzyconsciouspekingese.jpg')).toMatchObject(clip);
  });

  it('embeds other video players', () => {
    expect(link('https://streamable.com/38j5zr')).toMatchObject({ provider: 'streamable', src: 'https://streamable.com/e/38j5zr' });
    expect(link('https://clips.twitch.tv/ObedientSuperJamSeemsGood-7gVBnYxY6qfkoE_s')).toMatchObject({
      provider: 'twitch', src: 'https://clips.twitch.tv/embed?clip=ObedientSuperJamSeemsGood-7gVBnYxY6qfkoE_s',
    });
    expect(link('https://www.twitch.tv/somechannel/clip/FunnyClip-abc')).toMatchObject({ provider: 'twitch' });
    expect(link('https://vimeo.com/716982623')).toMatchObject({ src: 'https://player.vimeo.com/video/716982623?autoplay=1' });
    expect(link('https://www.tiktok.com/@someone/video/7100000000000000000')).toMatchObject({
      src: 'https://www.tiktok.com/embed/v2/7100000000000000000', frame: 'tall',
    });
    // Short links can't be resolved without asking TikTok
    expect(link('https://www.tiktok.com/t/ZTR1Y2V58/')).toEqual({ type: 'link', host: 'tiktok.com' });
  });

  it('shows tweets, Spotify and SoundCloud without a play button', () => {
    expect(link('https://twitter.com/someone/status/1532487942614175744?t=x&amp;s=19')).toMatchObject({
      provider: 'twitter', src: 'https://platform.twitter.com/embed/Tweet.html?id=1532487942614175744&dnt=true', play: false,
    });
    expect(link('https://x.com/someone/status/1532487942614175744')).toMatchObject({ provider: 'twitter' });
    expect(link('https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=1')).toMatchObject({
      src: 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC', height: 152, play: false,
    });
    expect(link('https://open.spotify.com/intl-de/playlist/3jO4556n6B8sf6W61GbwSB')).toMatchObject({ height: 352 });
    expect(link('https://soundcloud.com/artist/a-track?utm_source=clipboard&amp;utm_medium=text')).toMatchObject({
      src: `https://w.soundcloud.com/player/?url=${encodeURIComponent('https://soundcloud.com/artist/a-track')}&visual=false`,
      height: 166,
    });
  });

  it('shows GIPHY and Twitter images', () => {
    expect(link('https://giphy.com/gifs/season-4-the-simpsons-4x13-3o6MbaRaj7fmVOM61G')).toEqual({
      type: 'image', src: 'https://i.giphy.com/3o6MbaRaj7fmVOM61G.gif',
    });
    expect(link('https://pbs.twimg.com/media/FWa35KTWAAMXcoR?format=jpg&amp;name=small')).toEqual({
      type: 'image', src: 'https://pbs.twimg.com/media/FWa35KTWAAMXcoR?format=jpg&name=large',
    });
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
