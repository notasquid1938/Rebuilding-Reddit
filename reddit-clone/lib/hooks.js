import { useEffect, useState, useSyncExternalStore } from 'react';

// --- Available archive months (shared, fetched once per session) ---
let monthsPromise = null;
let monthsCache = null;

export function useAvailableMonths() {
  const [months, setMonths] = useState(monthsCache || []);
  useEffect(() => {
    if (monthsCache) return;
    monthsPromise ||= fetch('/api/AvailableDates')
      .then((r) => (r.ok ? r.json() : { collections: [] }))
      .then((data) => (monthsCache = (data.collections || []).sort()))
      .catch(() => {
        monthsPromise = null;
        return [];
      });
    let active = true;
    monthsPromise.then((m) => active && setMonths(m));
    return () => {
      active = false;
    };
  }, []);
  return months;
}

// --- Recently visited communities (localStorage, like Reddit's "Recent" list) ---
const RECENT_KEY = 'recentCommunities';
const listeners = new Set();
let recentSnapshot = null;

function readRecent() {
  if (recentSnapshot) return recentSnapshot;
  try {
    recentSnapshot = JSON.parse(localStorage.getItem(RECENT_KEY)) || [];
  } catch {
    recentSnapshot = [];
  }
  return recentSnapshot;
}

export function addRecentCommunity(name) {
  if (!name || typeof window === 'undefined') return;
  const next = [name, ...readRecent().filter((n) => n.toLowerCase() !== name.toLowerCase())].slice(0, 8);
  recentSnapshot = next;
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

const EMPTY = [];
export function useRecentCommunities() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    readRecent,
    () => EMPTY
  );
}

// --- Theme (initial value is applied by the inline script in _document.js) ---
export function useTheme() {
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme || 'light');
  }, []);
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('theme', next);
    } catch {}
    setTheme(next);
  };
  return [theme, toggle];
}

// --- Saved posts (localStorage; no accounts, so they stay in this browser) ---
const SAVED_KEY = 'savedPosts';
const SAVED_LIMIT = 1000;
// What a PostCard needs, so the Saved page works without asking the server
const SAVED_FIELDS = [
  'id', 'title', 'subreddit', 'author', 'score', 'num_comments', 'created_utc', 'url', 'domain', 'is_self',
  'over_18', 'spoiler', 'stickied', 'flair', 'thumbnail', 'distinguished', 'selftext',
];
const savedListeners = new Set();
let savedSnapshot = null;

function readSaved() {
  if (savedSnapshot) return savedSnapshot;
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY));
    savedSnapshot = Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === 'string') : [];
  } catch {
    savedSnapshot = [];
  }
  return savedSnapshot;
}

function writeSaved(next) {
  savedSnapshot = next;
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {}
  savedListeners.forEach((l) => l());
}

export function toggleSavedPost(post) {
  if (typeof window === 'undefined' || !post?.id) return;
  const saved = readSaved();
  if (saved.some((p) => p.id === post.id)) {
    writeSaved(saved.filter((p) => p.id !== post.id));
  } else {
    const entry = Object.fromEntries(SAVED_FIELDS.filter((f) => post[f] !== undefined).map((f) => [f, post[f]]));
    if (typeof entry.selftext === 'string') entry.selftext = entry.selftext.slice(0, 700);
    writeSaved([{ ...entry, savedAt: Date.now() }, ...saved].slice(0, SAVED_LIMIT));
  }
}

const subscribeSaved = (listener) => {
  savedListeners.add(listener);
  // Saves made in another tab
  const onStorage = (e) => {
    if (e.key === SAVED_KEY) {
      savedSnapshot = null;
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    savedListeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
};

export function useSavedPosts() {
  return useSyncExternalStore(subscribeSaved, readSaved, () => EMPTY);
}

export function useIsSaved(id) {
  return useSyncExternalStore(
    subscribeSaved,
    () => readSaved().some((p) => p.id === id),
    () => false
  );
}
