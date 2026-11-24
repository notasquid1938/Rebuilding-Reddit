// Visitor analytics (self-hosted Umami, see analytics/ in the repo root). Caddy
// serves the tracker from /stats on the site itself; it only reports from the
// domains listed, so local and test builds send nothing.
export const ANALYTICS = {
  src: '/stats/script.js',
  websiteId: '7ae9b5f2-10ec-4ca0-bd0e-e9d663a600f3',
  domains: 'redditrebuilt.com',
};

// Record a custom event (shown under Events in Umami). Waits for the page to
// finish loading if the deferred tracker hasn't run yet; does nothing when it
// is blocked or missing.
export function track(event, data) {
  if (typeof window === 'undefined') return;
  const send = () => {
    try {
      if (typeof window.umami?.track === 'function') window.umami.track(event, data);
    } catch {
      // Analytics must never break the page
    }
  };
  if (window.umami || document.readyState === 'complete') send();
  else window.addEventListener('load', send, { once: true });
}
