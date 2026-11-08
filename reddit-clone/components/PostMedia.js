import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getMedia, thumbnailUrl } from '@/lib/format';
import { useShowNsfw } from '@/lib/hooks';
import { ExternalIcon, PlayIcon } from './Icons';
import styles from '@/styles/Post.module.css';

const stop = (e) => e.stopPropagation();

// True under the blur, where players show a still instead of loading
const Blurred = createContext(false);

// Blurs NSFW / spoiler media until the reader chooses to reveal it. NSFW
// media stays unblurred for the session once the header's NSFW button is on;
// spoilers still wait for a click
const Reveal = ({ nsfw, spoiler, children }) => {
  const [revealed, setRevealed] = useState(false);
  const showNsfw = useShowNsfw();
  const hideNsfw = nsfw && !showNsfw;
  if (revealed || (!hideNsfw && !spoiler)) return children;
  return (
    <div className={styles.blurWrap}>
      <div className={styles.blurred} aria-hidden="true">
        <Blurred.Provider value>{children}</Blurred.Provider>
      </div>
      <button
        type="button"
        className={styles.revealButton}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setRevealed(true);
        }}
      >
        {hideNsfw ? 'View NSFW content' : 'View spoiler'}
      </button>
    </div>
  );
};

// Shown when an image or video can't be loaded any more, so the post still leads somewhere
const MediaUnavailable = ({ href, what = 'Image' }) => (
  <div className={`${styles.mediaFrame} ${styles.mediaUnavailable}`}>
    <span>{what} no longer available</span>
    <span className={styles.mediaUnavailableLinks}>
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" onClick={stop}>
        Original link <ExternalIcon size={12} />
      </a>
      <a
        href={`https://web.archive.org/web/2/${href}`}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={stop}
      >
        Wayback Machine <ExternalIcon size={12} />
      </a>
    </span>
  </div>
);

const ImageMedia = ({ src, alt, href }) => {
  const [failed, setFailed] = useState(false);
  if (failed) return <MediaUnavailable href={href} />;
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

const PlayPoster = ({ thumb, onPlay }) => (
  <button
    type="button"
    className={styles.videoPoster}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onPlay();
    }}
    aria-label="Play video"
  >
    {thumb && (
      <img
        src={thumb}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
      />
    )}
    <span className={styles.playBadge}>
      <PlayIcon size={28} />
    </span>
  </button>
);

const FRAME_CLASS = { wide: styles.videoFrame, tall: styles.tallFrame, audio: styles.audioFrame, tweet: styles.tweetFrame };

// A player from another site (YouTube, RedGIFs, Twitch, Spotify, ...); see getMedia
const EmbedMedia = ({ media, title, thumb }) => {
  const [clicked, setClicked] = useState(false);
  const blurred = useContext(Blurred);
  const playing = (clicked || !media.play) && !blurred;
  const [height, setHeight] = useState(media.height);
  const frameRef = useRef(null);

  // A tweet tells the page its height once rendered
  useEffect(() => {
    if (media.provider !== 'twitter') return undefined;
    const onMessage = (e) => {
      if (e.origin !== 'https://platform.twitter.com' || e.source !== frameRef.current?.contentWindow) return;
      let data = e.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const embed = data?.['twttr.embed'];
      const size = embed?.method === 'twttr.private.resize' && embed.params?.[0];
      if (size?.height > 0) setHeight(Math.ceil(size.height));
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [media.provider]);

  const src = () => (media.provider === 'twitch' ? `${media.src}&parent=${window.location.hostname}` : media.src);
  return (
    <div className={`${styles.mediaFrame} ${FRAME_CLASS[media.frame]}`} style={height ? { height } : undefined}>
      {playing ? (
        <iframe
          ref={frameRef}
          src={src()}
          title={title}
          loading="lazy"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write"
          allowFullScreen
          className={styles.videoEmbed}
        />
      ) : (
        <PlayPoster thumb={thumb} onPlay={() => setClicked(true)} />
      )}
    </div>
  );
};

// Reddit-hosted video (v.redd.it). Its HLS stream carries the sound: played
// through hls.js (loaded on the first play) wherever the browser has Media
// Source Extensions, since Chrome's own HLS support claims the stream and then
// fails on it; natively only where there's no MSE (older iPhones)
const RedditVideo = ({ id, thumb, href }) => {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!playing || !video) return undefined;
    const base = `https://v.redd.it/${id}`;
    const playlist = `${base}/HLSPlaylist.m3u8`;
    const start = (source) => {
      if (source) video.src = source;
      video.play().catch(() => {});
    };
    const native = video.canPlayType('application/vnd.apple.mpegurl');
    let hls = null;
    let cancelled = false;
    import('hls.js')
      .then(({ default: Hls }) => {
        if (cancelled) return;
        if (!Hls.isSupported()) {
          // No MSE: the native player, or the MP4 Reddit kept without sound
          start(native ? playlist : `${base}/DASH_480.mp4`);
          return;
        }
        hls = new Hls();
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return;
          hls.destroy();
          hls = null;
          setFailed(true);
        });
        hls.loadSource(playlist);
        hls.attachMedia(video);
        start();
      })
      .catch(() => (native ? start(playlist) : setFailed(true)));
    return () => {
      cancelled = true;
      hls?.destroy();
    };
  }, [playing, id]);

  if (failed) return <MediaUnavailable href={href} what="Video" />;
  return (
    <div className={`${styles.mediaFrame} ${styles.videoFrame}`}>
      {playing ? (
        <video ref={videoRef} className={styles.videoEmbed} controls playsInline onClick={stop} onError={() => setFailed(true)} />
      ) : (
        <PlayPoster thumb={thumb} onPlay={() => setPlaying(true)} />
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
  if (media.type === 'image') content = <ImageMedia src={media.src} alt={post.title} href={post.url} />;
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
  } else if (media.type === 'redditVideo') {
    content = <RedditVideo id={media.id} thumb={thumbnailUrl(post)} href={post.url} />;
  } else if (media.type === 'embed') {
    content = <EmbedMedia media={media} title={post.title} thumb={media.thumb || thumbnailUrl(post)} />;
  }

  return (
    <Reveal nsfw={post.over_18} spoiler={post.spoiler}>
      {content}
    </Reveal>
  );
};

export default PostMedia;
