import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { commentTablesForMonth, timedQuery, isMonth, ID_RE } from '@/lib/submissions';

export default async function handler(req, res) {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 100, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { id, month } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    if (!ID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid post ID format' });
    }

    if (month && !isMonth(month)) {
      return res.status(400).json({ error: 'Invalid month. Use YYYY-MM' });
    }

    const tables = (await commentTablesForMonth(month)).filter((t) => t.columns.has('link_id'));
    if (tables.length === 0) {
      return res.status(200).json({ available: false, totalComments: 0 });
    }

    const unionQuery = tables
      .map((t) => `SELECT COUNT(*) AS count FROM "${t.name}" WHERE link_id = $1`)
      .join(' UNION ALL ');
    const { rows } = await timedQuery(`SELECT SUM(count) AS total FROM (${unionQuery}) AS counts`, [`t3_${id.toLowerCase()}`]);

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ available: true, totalComments: parseInt(rows[0].total, 10) || 0 });
  } catch (error) {
    console.error('Error fetching comments data:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
