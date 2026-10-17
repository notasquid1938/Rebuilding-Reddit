import { memo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import SubredditIcon from './SubredditIcon';
import Markdown from './Markdown';
import PostMedia, { LinkThumbnail, LinkDomain } from './PostMedia';
import { VoteButtons, CommentsButton, ShareButton, SaveButton } from './PostActions';
import { decodeEntities, timeAgo, fullDate, postPath } from '@/lib/format';
import styles from '@/styles/Post.module.css';

export const PostTags = ({ post }) => {
  if (!post.over_18 && !post.spoiler && !post.flair && !post.stickied) return null;
  return (
    <div className={styles.tags}>
      {post.stickied && <span className={`${styles.tag} ${styles.tagPinned}`}>Pinned</span>}
      {post.over_18 && <span className={`${styles.tag} ${styles.tagNsfw}`}>NSFW</span>}
      {post.spoiler && <span className={`${styles.tag} ${styles.tagSpoiler}`}>Spoiler</span>}
      {post.flair && <span className={`${styles.tag} ${styles.tagFlair}`}>{decodeEntities(post.flair)}</span>}
    </div>
  );
};

// `context` decides which name leads the meta line, as on Reddit: feeds show
// the community, community pages show the author.
const PostCard = ({ post, context = 'feed' }) => {
  const router = useRouter();
  const href = postPath(post);

  // Whole card is clickable; real links and buttons inside keep their own behaviour
  const onCardClick = (e) => {
    if (e.defaultPrevented || e.target.closest('a, button, video, iframe')) return;
    if (window.getSelection()?.toString()) return;
    if (e.metaKey || e.ctrlKey) {
      window.open(href, '_blank');
      return;
    }
    router.push(href);
  };

  const showSubreddit = context !== 'subreddit' && post.subreddit;
  const showAuthor = context !== 'user';

  return (
    <article className={styles.card} onClick={onCardClick}>
      <div className={styles.meta}>
        {showSubreddit && (
          <Link href={`/r/${post.subreddit}`} className={styles.metaCommunity}>
            <SubredditIcon name={post.subreddit} size={24} />
            <span>r/{post.subreddit}</span>
          </Link>
        )}
        {showSubreddit && showAuthor && <span className={styles.metaDot}>•</span>}
        {showAuthor && (
          post.author === '[deleted]' ? (
            <span className={styles.metaAuthor}>[deleted]</span>
          ) : (
            <Link href={`/User/${post.author}`} className={styles.metaAuthor}>
              u/{post.author}
            </Link>
          )
        )}
        <span className={styles.metaDot}>•</span>
        <time className={styles.metaTime} suppressHydrationWarning dateTime={new Date(post.created_utc * 1000).toISOString()} title={fullDate(post.created_utc)}>
          {timeAgo(post.created_utc)}
        </time>
      </div>

      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <h3 className={styles.title}>
            <Link href={href}>{decodeEntities(post.title)}</Link>
          </h3>
          <PostTags post={post} />
          <LinkDomain post={post} />
        </div>
        <LinkThumbnail post={post} />
      </div>

      {post.is_self && post.selftext && !['[deleted]', '[removed]'].includes(post.selftext) && (
        <div className={styles.preview}>
          <Markdown>{post.selftext}</Markdown>
        </div>
      )}

      <PostMedia post={post} />

      <div className={styles.actions}>
        <VoteButtons score={post.score} />
        <CommentsButton count={post.num_comments} href={href} />
        <ShareButton path={href} />
        <SaveButton post={post} />
      </div>
    </article>
  );
};

export const PostSkeleton = () => (
  <div className={styles.skeleton} aria-hidden="true">
    <div className={styles.skeletonMeta} />
    <div className={styles.skeletonTitle} />
    <div className={styles.skeletonTitleShort} />
    <div className={styles.skeletonActions} />
  </div>
);

export default memo(PostCard);
