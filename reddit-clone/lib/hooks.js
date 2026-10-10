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
