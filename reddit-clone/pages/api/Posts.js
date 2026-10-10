import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { queryPosts, resolveSubreddit, isMonth, SUBREDDIT_RE, AUTHOR_RE } from '@/lib/submissions';

export default async function handler(req, res) {
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 100, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { startDate, endDate, author } = req.query;
    let { subreddit } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const sort = req.query.sort === 'new' ? 'new' : 'top';

    if (page < 1 || page > 10000) return res.status(400).json({ error: 'Invalid page' });
    if ((startDate && !isMonth(startDate)) || (endDate && !isMonth(endDate))) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM' });
    }
    if (author && !AUTHOR_RE.test(author)) return res.status(400).json({ error: 'Invalid author' });
    if (subreddit === 'all' || subreddit === '') subreddit = undefined;
    if (subreddit && !SUBREDDIT_RE.test(subreddit)) return res.status(400).json({ error: 'Invalid subreddit' });
    // Sorting by date needs the (author, created_utc) index; other feeds are Top only.
    if (sort === 'new' && !author) return res.status(400).json({ error: 'sort=new requires author' });

    if (subreddit) subreddit = await resolveSubreddit(subreddit);

    const posts = await queryPosts({
      startDate,
      endDate,
      subreddit,
      author,
      sort,
      limit,
      offset: (page - 1) * limit,
    });
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).json(posts);
  } catch (error) {
    console.error('Error fetching posts:', error.message);
    const timedOut = error.code === '57014';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'This feed took too long to load. Try a narrower date range or a different sort.' : 'Server Error',
    });
  }
}
