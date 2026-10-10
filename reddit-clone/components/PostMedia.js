import { useState } from 'react';
import { getMedia, thumbnailUrl } from '@/lib/format';
import { ExternalIcon, PlayIcon } from './Icons';
import styles from '@/styles/Post.module.css';

const stop = (e) => e.stopPropagation();

// Blurs NSFW / spoiler media until the reader chooses to reveal it
const Reveal = ({ reason, children }) => {
  const [revealed, setRevealed] = useState(!reason);
  if (revealed) return children;
  return (
    <div className={styles.blurWrap}>
      <div className={styles.blurred} aria-hidden="true">{children}</div>
      <button
        type="button"
        className={styles.revealButton}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(true);
        }}
      >
        {reason === 'nsfw' ? 'View NSFW content' : 'View spoiler'}
      </button>
    </div>
  );
};

const ImageMedia = ({ src, alt }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <div className={styles.mediaFrame}>
      <img
        src={src}
        alt={alt}
        className={styles.mediaImage}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </div>
  );
};

const YouTubeMedia = ({ id, thumb, title }) => {
  const [playing, setPlaying] = useState(false);
  return (
    <div className={`${styles.mediaFrame} ${styles.videoFrame}`}>
      {playing ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className={styles.videoEmbed}
        />
      ) : (
        <button
          type="button"
          className={styles.videoPoster}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPlaying(true);
          }}
          aria-label="Play video"
        >
          <img
            src={thumb}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
          />
          <span className={styles.playBadge}>
            <PlayIcon size={28} />
          </span>
        </button>
      )}
    </div>
  );
};

export const LinkThumbnail = ({ post }) => {
  const [failed, setFailed] = useState(false);
  const thumb = thumbnailUrl(post);
  const media = getMedia(post);
  if (!media || media.type !== 'link') return null;
  return (
    <a className={styles.linkThumb} href={post.url} target="_blank" rel="noopener noreferrer nofollow" onClick={stop}>
      {thumb && !failed ? (
        <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span className={styles.linkThumbPlaceholder}>
          <ExternalIcon size={24} />
        </span>
      )}
      <span className={styles.linkThumbHost}>{media.host}</span>
    </a>
  );
};

export const LinkDomain = ({ post }) => {
  const media = getMedia(post);
  if (!media || media.type !== 'link') return null;
  let display = post.url.replace(/^https?:\/\/(www\.)?/, '');
  if (display.length > 48) display = `${display.slice(0, 45)}...`;
  return (
    <a className={styles.linkDomain} href={post.url} target="_blank" rel="noopener noreferrer nofollow" onClick={stop}>
      {display}
      <ExternalIcon size={12} />
    </a>
  );
};

const PostMedia = ({ post }) => {
  const media = getMedia(post);
  if (!media || media.type === 'link') return null;

  let content;
  if (media.type === 'image') content = <ImageMedia src={media.src} alt={post.title} />;
  else if (media.type === 'video') {
    content = (
      <div className={styles.mediaFrame}>
        <video
          className={styles.mediaImage}
          src={media.src}
          poster={media.poster}
          controls
          muted
          loop
          playsInline
          preload="none"
          onClick={stop}
        />
      </div>
    );
  } else if (media.type === 'youtube') content = <YouTubeMedia {...media} title={post.title} />;

  const reason = post.over_18 ? 'nsfw' : post.spoiler ? 'spoiler' : null;
  return <Reveal reason={reason}>{content}</Reveal>;
};

export default PostMedia;
