import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { getTopCommunities, isMonth } from '@/lib/submissions';

export default async function handler(req, res) {
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 100, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { startDate, endDate } = req.query;
  if ((startDate && !isMonth(startDate)) || (endDate && !isMonth(endDate))) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM' });
  }

  try {
    const communities = await getTopCommunities(startDate, endDate, 10);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({ communities });
  } catch (error) {
    console.error('Error fetching top communities:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
