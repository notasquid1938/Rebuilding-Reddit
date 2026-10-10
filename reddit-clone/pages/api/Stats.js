import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import {
  getSubmissionTables, tablesInRange, timedQuery, hasTable, resolveSubreddit, isMonth, SUBREDDIT_RE,
} from '@/lib/submissions';

export default async function handler(req, res) {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 20, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { startDate, endDate } = req.query;
    let subreddit = req.query.subreddit;

    if ((startDate && !isMonth(startDate)) || (endDate && !isMonth(endDate))) {
      return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM' });
    }

    if (subreddit === 'all' || subreddit === '') subreddit = undefined;
    if (subreddit && !SUBREDDIT_RE.test(subreddit)) {
      return res.status(400).json({ error: 'Invalid subreddit name' });
    }
    if (subreddit) subreddit = await resolveSubreddit(subreddit);

    const tables = tablesInRange(await getSubmissionTables(), startDate, endDate)
      .filter((t) => t.columns.has('author') && t.columns.has('subreddit'));
    if (tables.length === 0) {
      return res.status(404).json({ error: 'No tables found for the given date range' });
    }

    const params = subreddit ? [subreddit] : [];
    const where = subreddit ? ' WHERE subreddit = $1' : '';

    // Post counts per subreddit come from the precomputed monthly rollup when it exists
    let topSubreddits;
    let totalPosts;
    if (await hasTable('subreddit_monthly')) {
      const rangeParams = [...params, `${tables[0].month}-01`, `${tables[tables.length - 1].month}-01`];
      const offset = params.length;
      const { rows } = await timedQuery(
        `SELECT subreddit, SUM(posts)::bigint AS posts, SUM(SUM(posts)) OVER ()::bigint AS total
           FROM subreddit_monthly
          WHERE month BETWEEN $${offset + 1}::date AND $${offset + 2}::date ${subreddit ? 'AND subreddit = $1' : ''}
          GROUP BY subreddit ORDER BY posts DESC LIMIT 10`,
        rangeParams
      );
      topSubreddits = rows.map((row) => ({ subreddit: row.subreddit, posts: Number(row.posts) }));
      totalPosts = rows.length ? Number(rows[0].total) : 0;
    }

    const unionQuery = tables.map((t) => `SELECT author, subreddit FROM "${t.name}"${where}`).join(' UNION ALL ');
    const { rows: userRows } = await timedQuery(
      `WITH all_posts AS (${unionQuery})
       SELECT author, COUNT(*) AS post_count, COUNT(*) OVER () AS unique_users, SUM(COUNT(*)) OVER () AS total
         FROM all_posts
        WHERE author IS NOT NULL AND author NOT IN ('[deleted]', 'None')
        GROUP BY author ORDER BY post_count DESC LIMIT 10`,
      params,
      30000
    );

    if (!topSubreddits) {
      const { rows } = await timedQuery(
        `WITH all_posts AS (${unionQuery})
         SELECT subreddit, COUNT(*) AS posts, SUM(COUNT(*)) OVER () AS total
           FROM all_posts GROUP BY subreddit ORDER BY posts DESC LIMIT 10`,
        params,
        30000
      );
      topSubreddits = rows.map((row) => ({ subreddit: row.subreddit, posts: Number(row.posts) }));
      totalPosts = rows.length ? Number(rows[0].total) : 0;
    }

    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({
      totalPosts,
      uniqueUsers: userRows.length ? Number(userRows[0].unique_users) : 0,
      topSubreddits,
      topUsers: userRows.map((row) => ({ user: row.author, posts: Number(row.post_count) })),
    });
  } catch (error) {
    console.error('Error in Stats API:', error.message);
    const timedOut = error.code === '57014';
    res.status(timedOut ? 504 : 500).json({
      error: timedOut ? 'Stats for this range take too long to compute' : 'Internal Server Error',
    });
  }
}
