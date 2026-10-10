import { useState } from 'react';
import Link from 'next/link';
import { UpvoteIcon, DownvoteIcon, CommentIcon, ShareIcon } from './Icons';
import { formatCount } from '@/lib/format';
import styles from '@/styles/Post.module.css';

// Votes are local only: this is a read-only archive, but the control should
// still feel like Reddit's.
export const VoteButtons = ({ score, size = 'md' }) => {
  const [vote, setVote] = useState(0);
  const cast = (e, value) => {
    e.preventDefault();
    e.stopPropagation();
    setVote(vote === value ? 0 : value);
  };
  const stateClass = vote === 1 ? styles.voteUp : vote === -1 ? styles.voteDown : '';
  return (
    <span className={`${styles.pill} ${styles.votePill} ${stateClass} ${size === 'sm' ? styles.pillSmall : ''}`}>
      <button type="button" className={styles.voteButton} onClick={(e) => cast(e, 1)} aria-label="Upvote" aria-pressed={vote === 1}>
        <UpvoteIcon size={size === 'sm' ? 16 : 18} filled={vote === 1} />
      </button>
      <span className={styles.score}>{formatCount(score + vote)}</span>
      <button type="button" className={styles.voteButton} onClick={(e) => cast(e, -1)} aria-label="Downvote" aria-pressed={vote === -1}>
        <DownvoteIcon size={size === 'sm' ? 16 : 18} filled={vote === -1} />
      </button>
    </span>
  );
};

export const ShareButton = ({ path, size = 'md', label = 'Share' }) => {
  const [copied, setCopied] = useState(false);
  const share = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy link', url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button type="button" className={`${styles.pill} ${styles.pillButton} ${size === 'sm' ? styles.pillSmall : ''}`} onClick={share}>
      <ShareIcon size={size === 'sm' ? 16 : 18} />
      <span>{copied ? 'Copied!' : label}</span>
    </button>
  );
};

export const CommentsButton = ({ count, href }) => {
  const content = (
    <>
      <CommentIcon size={18} />
      <span>{formatCount(count)}</span>
    </>
  );
  return href ? (
    <Link href={href} className={`${styles.pill} ${styles.pillButton}`} aria-label={`${count} comments`}>
      {content}
    </Link>
  ) : (
    <span className={`${styles.pill} ${styles.pillStatic}`} aria-label={`${count} comments`}>
      {content}
    </span>
  );
};
