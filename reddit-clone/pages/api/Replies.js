import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { commentTablesForMonth, fetchCommentTree, isMonth, ID_RE } from '@/lib/submissions';
import { isCommentSort } from '@/lib/sorts';

export default async function handler(req, res) {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 100, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { commentId, month } = req.query;
    const sort = isCommentSort(req.query.sort) ? req.query.sort : 'top';

    if (!commentId) {
      return res.status(400).json({ error: 'Missing comment ID' });
    }

    if (!ID_RE.test(commentId)) {
      return res.status(400).json({ error: 'Invalid comment ID format' });
    }

    if (month && !isMonth(month)) {
      return res.status(400).json({ error: 'Invalid month. Use YYYY-MM' });
    }

    const tables = await commentTablesForMonth(month);
    if (tables.length === 0) {
      return res.status(200).json({ replies: [] });
    }

    const replies = await fetchCommentTree(tables, [`t1_${commentId.toLowerCase()}`], { depth: 3, sort });

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ replies });
  } catch (error) {
    console.error('Error fetching replies:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
