import { afterEach, describe, expect, it, vi } from 'vitest';
import { ANALYTICS, track } from '@/lib/analytics';

// A minimal browser: track() only touches window.umami, addEventListener and document.readyState
function browser(readyState, umami) {
  const listeners = {};
  vi.stubGlobal('document', { readyState });
  vi.stubGlobal('window', {
    umami,
    addEventListener: (type, fn) => { listeners[type] = fn; },
  });
  return listeners;
}

afterEach(() => vi.unstubAllGlobals());

describe('track', () => {
  it('sends straight away once the tracker has loaded', () => {
    const umami = { track: vi.fn() };
    browser('interactive', umami);
    track('page-not-found', { path: '/x' });
    expect(umami.track).toHaveBeenCalledWith('page-not-found', { path: '/x' });
  });

  it('waits for the page to load when the tracker has not run yet', () => {
    const listeners = browser('interactive', undefined);
    track('community-not-archived', { community: 'foo' });
    const umami = { track: vi.fn() };
    window.umami = umami;
    listeners.load();
    expect(umami.track).toHaveBeenCalledWith('community-not-archived', { community: 'foo' });
  });

  it('does nothing when the tracker is blocked', () => {
    browser('complete', undefined);
    expect(() => track('page-not-found')).not.toThrow();
  });

  it('never lets a tracker error reach the page', () => {
    browser('complete', { track: () => { throw new Error('boom'); } });
    expect(() => track('page-not-found')).not.toThrow();
  });

  it('does nothing on the server', () => {
    expect(() => track('page-not-found')).not.toThrow();
  });
});

describe('ANALYTICS', () => {
  it('only reports from the live site', () => {
    expect(ANALYTICS.domains).toBe('redditrebuilt.com');
    expect(ANALYTICS.src).toBe('/stats/script.js');
  });
});
