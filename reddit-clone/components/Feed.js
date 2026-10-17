import { useCallback, useEffect, useRef, useState } from 'react';
import PostCard, { PostSkeleton } from './PostCard';
import { SORT_LABELS } from '@/lib/sorts';
import styles from '@/styles/Feed.module.css';

const PAGE_SIZE = 15;

// Feeds survive client-side navigation so "back" from a thread restores the
// list (and, with scrollRestoration, the scroll position) without refetching.
const feedCache = new Map();

function buildUrl({ startDate, endDate, subreddit, author, sort }, page) {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (subreddit) params.set('subreddit', subreddit);
  if (author) params.set('author', author);
  if (sort) params.set('sort', sort);
  return `/api/Posts?${params}`;
}

// Remount with a different `key` whenever the query changes.
const Feed = ({ query, context = 'feed', emptyMessage = 'No posts found for this period.' }) => {
  const cacheKey = JSON.stringify(query);
  const [state, setState] = useState(() => feedCache.get(cacheKey) || { posts: [], page: 0, done: false, truncated: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const sentinelRef = useRef(null);
  const loadingRef = useRef(false);

  useEffect(() => {
    feedCache.set(cacheKey, state);
  }, [cacheKey, state]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || state.done) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildUrl(query, state.page + 1));
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to load posts');
      const truncated = response.headers.get('X-Feed-Truncated') === '1';
      setState((prev) => {
        const seen = new Set(prev.posts.map((p) => p.id));
        const fresh = data.filter((p) => !seen.has(p.id));
        return {
          posts: [...prev.posts, ...fresh],
          page: prev.page + 1,
          done: truncated || data.length < PAGE_SIZE,
          truncated,
        };
      });
    } catch (err) {
      setError(err.message);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [query, state.page, state.done]);

  // Initial page
  useEffect(() => {
    if (state.page === 0 && !state.done) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Infinite scroll
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || state.done || error) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && state.page > 0) loadMore();
      },
      { rootMargin: '1200px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, state.done, state.page, error]);

  const { posts, done, truncated } = state;

  return (
    <div className={styles.feed}>
      {posts.map((post) => (
        <div key={post.id}>
          <PostCard post={post} context={context} />
          <hr />
        </div>
      ))}

      {loading && (
        <>
          <PostSkeleton />
          {posts.length === 0 && (
            <>
              <hr />
              <PostSkeleton />
              <hr />
              <PostSkeleton />
            </>
          )}
        </>
      )}

      {error && (
        <div className={styles.message}>
          <p>{error}</p>
          <button type="button" className={styles.retry} onClick={loadMore}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && done && posts.length === 0 && (
        <div className={styles.message}>
          <p className={styles.emptyTitle}>Nothing here</p>
          <p>{emptyMessage}</p>
        </div>
      )}

      {!loading && done && posts.length > 0 && (
        <p className={styles.end}>
          {truncated
            ? `That's as far as ${SORT_LABELS[query.sort] || 'this sort'} goes for this date range.${
                !query.startDate || query.startDate !== query.endDate ? ' Pick a shorter range to see more.' : ''
              }`
            : "You've reached the end of this feed."}
        </p>
      )}

      <div ref={sentinelRef} className={styles.sentinel} />
    </div>
  );
};

export default Feed;
