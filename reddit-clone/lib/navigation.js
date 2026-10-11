// Tracks whether the previous history entry is a page of this site, so in-page
// back buttons can return to it instead of guessing. document.referrer can't be
// used: client-side navigation doesn't update it.
//
// Next.js tags every history entry with a key. We remember the key of the
// entry the visitor landed on; any other entry was reached from within the
// site. Next assigns keys after hydration and gives an entry a new key when it
// is reloaded, so the landing key is resolved lazily ("pending").

const STORAGE_KEY = 'landingHistoryKey';
const PENDING = 'pending';

const storage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null; // blocked (privacy mode)
  }
};

// Runs when _app's module loads, before Next's router replaces history.state,
// so the key seen here is the one the entry had before this page load.
if (typeof window !== 'undefined' && storage()) {
  const [entry] = performance.getEntriesByType('navigation');
  const previousKey = window.history.state?.key;
  const stored = storage().getItem(STORAGE_KEY);
  // A new visit, or the landing page itself reloaded / returned to
  if (!stored || !entry || entry.type === 'navigate' || stored === previousKey) {
    storage().setItem(STORAGE_KEY, PENDING);
  }
}

// Call while still on the landing entry: before the first in-app navigation
export function resolveLanding() {
  const s = storage();
  const key = window.history.state?.key;
  if (s && key && s.getItem(STORAGE_KEY) === PENDING) s.setItem(STORAGE_KEY, key);
}

export function canGoBack() {
  const s = storage();
  if (!s) return false;
  resolveLanding();
  const key = window.history.state?.key;
  return Boolean(key) && key !== s.getItem(STORAGE_KEY);
}
