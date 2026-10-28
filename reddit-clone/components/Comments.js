import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Markdown from './Markdown';
import UserAvatar from './UserAvatar';
import { VoteButtons, ShareButton } from './PostActions';
import { PlusCircleIcon } from './Icons';
import { timeAgo, fullDate, formatCount } from '@/lib/format';
import { COMMENT_SORTS, SORT_LABELS } from '@/lib/sorts';
import styles from '@/styles/Comments.module.css';

export const PAGE_SIZE = 20;

const Comment = ({ comment, month, postId, opAuthor, sort, depth = 0 }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [replies, setReplies] = useState(comment.replies);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const loadReplies = async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams({ commentId: comment.id, sort });
      if (month) params.set('month', month);
      const response = await fetch(`/api/Replies?${params}`);
      if (!response.ok) throw new Error();
      const data = await response.json();
      setReplies(data.replies);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const deleted = comment.author === '[deleted]';
  const isOp = !deleted && comment.author === opAuthor;

  return (
    <div className={`${styles.comment} ${collapsed ? styles.collapsed : ''}`} id={`t1_${comment.id}`}>
      <div className={styles.gutter}>
        {collapsed ? (
          <button type="button" className={styles.toggle} onClick={() => setCollapsed(false)} aria-label="Expand comment">
            <PlusCircleIcon size={16} />
          </button>
        ) : (
          <>
            <UserAvatar name={comment.author} size={28} />
            <button
              type="button"
              className={styles.threadLine}
              onClick={() => setCollapsed(true)}
              aria-label="Collapse comment thread"
            />
          </>
        )}
      </div>

      <div className={styles.content}>
        <div className={styles.meta}>
          {collapsed && <UserAvatar name={comment.author} size={20} />}
          {deleted ? (
            <span className={styles.author}>[deleted]</span>
          ) : (
            <Link href={`/User/${comment.author}`} className={styles.author}>
              {comment.author}
            </Link>
          )}
          {isOp && <span className={styles.op}>OP</span>}
          {comment.distinguished === 'moderator' && <span className={styles.mod}>MOD</span>}
          {comment.flair && <span className={styles.flair}>{comment.flair}</span>}
          <span className={styles.dot}>•</span>
          <time title={fullDate(comment.created_utc)} suppressHydrationWarning>
            {timeAgo(comment.created_utc)}
          </time>
          {collapsed && replies?.length > 0 && (
            <span className={styles.collapsedCount}>
              ({replies.length} {replies.length === 1 ? 'reply' : 'replies'})
            </span>
          )}
        </div>

        {!collapsed && (
          <>
            <Markdown className={styles.body}>{comment.body}</Markdown>
            <div className={styles.actions}>
              <VoteButtons score={comment.score} size="sm" />
              {comment.controversial && (
                <span className={styles.controversial} title="Controversial: lots of upvotes and downvotes">
                  †
                </span>
              )}
              <ShareButton path={`/Thread/${postId}#t1_${comment.id}`} size="sm" />
            </div>

            {replies?.length > 0 && (
              <div className={styles.replies}>
                {replies.map((reply) => (
                  <Comment
                    key={reply.id}
                    comment={reply}
                    month={month}
                    postId={postId}
                    opAuthor={opAuthor}
                    sort={sort}
                    depth={depth + 1}
                  />
                ))}
              </div>
            )}

            {replies === undefined && comment.more && (
              <button type="button" className={styles.moreButton} onClick={loadReplies} disabled={loading}>
                {loading ? 'Loading…' : error ? 'Couldn’t load replies. Try again' : 'Continue this thread →'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// `initial`: the first page in the default sort, from the page's server
// render ({ available, comments } as /api/Comments returns it), or null to
// fetch it here
const CommentSection = ({ post, initial = null }) => {
  const [comments, setComments] = useState(() => initial?.comments || []);
  const [sort, setSort] = useState('top');
  const [page, setPage] = useState(1);
  // loading | ready | unavailable | error
  const [status, setStatus] = useState(() => (initial ? (initial.available ? 'ready' : 'unavailable') : 'loading'));
  const [hasMore, setHasMore] = useState(() => initial?.comments.length === PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);
  const served = useRef(Boolean(initial));

  useEffect(() => {
    if (served.current && page === 1 && sort === 'top') return;
    served.current = false;
    let active = true;
    const load = async () => {
      if (page === 1) setStatus('loading');
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({ id: post.id, page: String(page), commentsPerPage: String(PAGE_SIZE), sort });
        if (post.month) params.set('month', post.month);
        const response = await fetch(`/api/Comments?${params}`);
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!active) return;
        if (!data.available) {
          setStatus('unavailable');
          return;
        }
        setComments((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...data.comments.filter((c) => !seen.has(c.id))];
        });
        setHasMore(data.comments.length === PAGE_SIZE);
        setStatus('ready');
      } catch {
        if (active) setStatus(page === 1 ? 'error' : 'ready');
      } finally {
        if (active) setLoadingMore(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [post.id, post.month, page, sort]);

  const changeSort = (next) => {
    if (next === sort) return;
    setComments([]);
    setHasMore(false);
    setPage(1);
    setSort(next);
  };

  return (
    <section className={styles.section} aria-label="Comments">
      {(comments.length > 0 || (status === 'loading' && sort !== 'top')) && (
        <div className={styles.sectionHeader}>
          <label className={styles.sortLabel}>
            Sort by:{' '}
            <select value={sort} onChange={(e) => changeSort(e.target.value)} className={styles.sortSelect}>
              {COMMENT_SORTS.map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {status === 'loading' && <div className={styles.placeholder}>Loading comments…</div>}

      {status === 'error' && <div className={styles.placeholder}>Comments couldn&apos;t be loaded right now.</div>}

      {status === 'unavailable' && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>Comments aren&apos;t archived yet</p>
          <p>
            {post.num_comments > 0
              ? `This post had ${formatCount(post.num_comments)} comment${post.num_comments === 1 ? '' : 's'} on Reddit. `
              : ''}
            Comments for this period haven&apos;t been loaded into the archive yet.
          </p>
        </div>
      )}

      {status === 'ready' && comments.length === 0 && (
        <div className={styles.emptyState}>
          <p className={styles.emptyTitle}>No comments yet</p>
          <p>Nobody commented on this post, or the comments weren&apos;t captured.</p>
        </div>
      )}

      {comments.map((comment) => (
        <Comment
          key={comment.id}
          comment={comment}
          month={post.month}
          postId={post.id}
          opAuthor={post.author}
          sort={sort}
        />
      ))}

      {status === 'ready' && hasMore && (
        <button type="button" className={styles.loadMore} onClick={() => setPage(page + 1)} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : 'View more comments'}
        </button>
      )}
    </section>
  );
};

export default CommentSection;
