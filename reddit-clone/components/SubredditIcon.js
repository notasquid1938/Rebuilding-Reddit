const SubredditIcon = ({ name, size = 24, className = '' }) => (
  <img
    src={`/api/SubredditIcons?subreddit=${encodeURIComponent(name || 'reddit')}`}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    className={className}
    style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
  />
);

export default SubredditIcon;
