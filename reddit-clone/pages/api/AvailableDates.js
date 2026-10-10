import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { getSubmissionTables } from '@/lib/submissions';

export default async function handler(req, res) {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 100, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    // Only months whose table actually holds data (getSubmissionTables caches for 5 minutes)
    const tables = await getSubmissionTables();

    if (tables.length === 0) {
      return res.status(404).json({ error: 'No date collections found' });
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json({ collections: tables.map((t) => t.month) });
  } catch (error) {
    console.error('Error fetching available dates:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
