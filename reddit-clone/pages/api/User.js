import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { getUserStats, AUTHOR_RE, BusyError } from '@/lib/submissions';

export default async function handler(req, res) {
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 60, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { name } = req.query;
  if (!name || !AUTHOR_RE.test(name)) {
    return res.status(400).json({ error: 'Invalid user name' });
  }

  try {
    const stats = await getUserStats(name);
    if (!stats) return res.status(404).json({ error: 'No data' });
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json(stats);
  } catch (error) {
    if (error instanceof BusyError) {
      res.setHeader('Retry-After', '30');
      return res.status(503).json({ error: 'The archive is busy. Try again in a moment.' });
    }
    // Very prolific accounts can exceed the statement timeout; the page works without stats
    console.error('Error fetching user stats:', error.message);
    res.status(error.code === '57014' ? 504 : 500).json({ error: 'Could not load user stats' });
  }
}
