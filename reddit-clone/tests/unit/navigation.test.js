import { afterEach, describe, expect, it, vi } from 'vitest';

// lib/navigation.js decides whether the thread page's back button can use
// history.back(). Simulates the browser: history keys, sessionStorage
// (persists across page loads in a tab) and the navigation type of each load.
function browser() {
  const store = new Map();
  const win = {
    history: { state: null },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  let navType = 'navigate';
  vi.stubGlobal('window', win);
  vi.spyOn(performance, 'getEntriesByType').mockImplementation(() => [{ type: navType }]);

  return {
    // A full page load: the module re-runs, then Next assigns a fresh key
    async load(type, previousKey, newKey) {
      navType = type;
      win.history.state = previousKey ? { key: previousKey } : null;
      vi.resetModules();
      const nav = await import('@/lib/navigation');
      win.history.state = { key: newKey };
      return nav;
    },
    // Client-side navigation (pushState / popstate)
    go(nav, key) {
      nav.resolveLanding();
      win.history.state = { key };
    },
    pop(key) {
      win.history.state = { key };
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('canGoBack', () => {
  it('is false on the page the visitor landed on', async () => {
    const b = browser();
    const nav = await b.load('navigate', null, 'home');
    expect(nav.canGoBack()).toBe(false);
  });

  it('is true after navigating within the site', async () => {
    const b = browser();
    const nav = await b.load('navigate', null, 'home');
    b.go(nav, 'thread');
    expect(nav.canGoBack()).toBe(true);
  });

  it('is false again after returning to the landing page', async () => {
    const b = browser();
    const nav = await b.load('navigate', null, 'thread');
    b.go(nav, 'subreddit');
    b.pop('thread');
    expect(nav.canGoBack()).toBe(false);
  });

  it('survives reloading a later page', async () => {
    const b = browser();
    let nav = await b.load('navigate', null, 'home');
    b.go(nav, 'thread');
    nav = await b.load('reload', 'thread', 'thread-2');
    expect(nav.canGoBack()).toBe(true);
  });

  it('stays false when the landing page itself is reloaded', async () => {
    const b = browser();
    let nav = await b.load('navigate', null, 'thread');
    nav.resolveLanding();
    nav = await b.load('reload', 'thread', 'thread-2');
    expect(nav.canGoBack()).toBe(false);
  });

  it('resets on a fresh visit in the same tab', async () => {
    const b = browser();
    let nav = await b.load('navigate', null, 'home');
    b.go(nav, 'thread');
    nav = await b.load('navigate', null, 'other-thread');
    expect(nav.canGoBack()).toBe(false);
  });

  it('is false when sessionStorage is blocked', async () => {
    const b = browser();
    const nav = await b.load('navigate', null, 'home');
    Object.defineProperty(window, 'sessionStorage', { get: () => { throw new Error('blocked'); } });
    b.go(nav, 'thread');
    expect(nav.canGoBack()).toBe(false);
  });
});
