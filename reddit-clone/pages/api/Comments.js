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
    const { id, page, month, commentsPerPage = 20 } = req.query;
    const sort = isCommentSort(req.query.sort) ? req.query.sort : 'top';

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    if (!ID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid post ID format' });
    }

    const pageNum = parseInt(page, 10) || 1;
    const perPage = parseInt(commentsPerPage, 10);

    if (pageNum < 1 || pageNum > 10000) {
      return res.status(400).json({ error: 'Invalid page number' });
    }

    if (!(perPage >= 1 && perPage <= 100)) {
      return res.status(400).json({ error: 'Invalid comments per page (1-100)' });
    }

    if (month && !isMonth(month)) {
      return res.status(400).json({ error: 'Invalid month. Use YYYY-MM' });
    }

    // `month` is the post's month; it narrows the search to the tables that can hold its comments
    const tables = await commentTablesForMonth(month);
    if (tables.length === 0) {
      return res.status(200).json({ available: false, comments: [] });
    }

    const comments = await fetchCommentTree(tables, [`t3_${id.toLowerCase()}`], {
      depth: 4,
      limit: perPage,
      offset: (pageNum - 1) * perPage,
      sort,
    });

    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ available: true, comments });
  } catch (error) {
    console.error('Error fetching comments data:', error.message);
    res.status(500).json({
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
