import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { getSubredditInfo, SUBREDDIT_RE } from '@/lib/submissions';

export default async function handler(req, res) {
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 100, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { name } = req.query;
  if (!name || !SUBREDDIT_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid subreddit name' });
  }

  try {
    const info = await getSubredditInfo(name);
    if (!info) return res.status(404).json({ error: 'Subreddit not found' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(info);
  } catch (error) {
    console.error('Error fetching subreddit info:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
