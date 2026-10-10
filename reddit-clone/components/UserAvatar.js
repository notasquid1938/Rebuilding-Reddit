const COLORS = ['#FF4500', '#0079D3', '#46D160', '#FFB000', '#7193FF', '#FF585B', '#0DD3BB', '#DB0064', '#9E58FF', '#349E48'];

function colorFor(name) {
  let hash = 0;
  for (const ch of name || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

// A simple Snoo-style head on a coloured circle, standing in for Reddit's default avatars
const UserAvatar = ({ name, size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" style={{ flexShrink: 0, borderRadius: '50%' }}>
    <circle cx="20" cy="20" r="20" fill={name === '[deleted]' ? '#8BA2AD' : colorFor(name)} />
    <ellipse cx="20" cy="24" rx="11" ry="8" fill="#fff" />
    <circle cx="16" cy="23" r="1.8" fill="#0F1A1C" />
    <circle cx="24" cy="23" r="1.8" fill="#0F1A1C" />
    <path d="M16.5 27.2c2.1 1.3 4.9 1.3 7 0" stroke="#0F1A1C" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    <path d="M20 16l1.6-6 4.2 1" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    <circle cx="27" cy="11.2" r="1.8" fill="#fff" />
    <circle cx="10.5" cy="19.5" r="2.4" fill="#fff" />
    <circle cx="29.5" cy="19.5" r="2.4" fill="#fff" />
  </svg>
);

export default UserAvatar;
