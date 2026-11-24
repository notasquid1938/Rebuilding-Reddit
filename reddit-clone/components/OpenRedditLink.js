import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { archivedPath } from '@/lib/links';
import { SITE_URL } from '@/lib/site';
import styles from '@/styles/OpenRedditLink.module.css';

// A bookmark that opens the Reddit page being viewed on this site (pages/open.js)
export const BOOKMARKLET = `javascript:location.href='${SITE_URL}/open?url='+encodeURIComponent(location.href)`;

// Takes a pasted Reddit link to its archived copy
export default function OpenRedditLink({ initialLink = '', initialError = false }) {
  const router = useRouter();
  const [link, setLink] = useState(initialLink);
  const [error, setError] = useState(initialError);
  const bookmarklet = useRef(null);

  // React won't render a javascript: href, so the bookmarklet's is set directly
  useEffect(() => {
    bookmarklet.current?.setAttribute('href', BOOKMARKLET);
  }, []);

  const submit = (event) => {
    event.preventDefault();
    const path = archivedPath(link);
    if (path) router.push(path);
    else setError(true);
  };

  return (
    <section className={styles.card} aria-labelledby="open-reddit-link">
      <h2 id="open-reddit-link" className={styles.title}>
        Removed or deleted on Reddit?
      </h2>
      <p className={styles.text}>
        Paste a Reddit link to see the thread, community or user as it was archived, or swap <code>reddit.com</code> for{' '}
        <code>redditrebuilt.com</code> in the address.
      </p>
      <form className={styles.form} onSubmit={submit}>
        <input
          className={styles.input}
          type="text"
          inputMode="url"
          aria-label="Reddit link"
          placeholder="https://www.reddit.com/r/…/comments/…"
          value={link}
          onChange={(event) => {
            setLink(event.target.value);
            setError(false);
          }}
        />
        <button type="submit" className={styles.button}>
          Open
        </button>
      </form>
      {error && (
        <p role="alert" className={styles.error}>
          That isn&apos;t a link to a Reddit thread, community or user. Share links from the Reddit app (…/s/…) need
          opening in a browser first to get the full link.
        </p>
      )}
      <p className={styles.hint}>
        Or drag{' '}
        <a ref={bookmarklet} className={styles.bookmarklet} onClick={(event) => event.preventDefault()}>
          Open in Reddit Rebuilt
        </a>{' '}
        to your bookmarks bar and click it on any Reddit page.
      </p>
    </section>
  );
}
