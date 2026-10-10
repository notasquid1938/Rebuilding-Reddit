import fs from 'fs';
import path from 'path';
import connectToDatabase from '../../db';
import { checkRateLimit, getClientIp } from '../../middleware/rateLimit';
import { hasTable, isMonth } from '@/lib/submissions';

// Fallback when subreddits_metadata hasn't been built: a sorted, lowercased
// name list (no popularity data, so shortest names win).
let subredditList = null;
function searchSubredditList(prefix) {
  if (!subredditList) {
    try {
      subredditList = fs
        .readFileSync(path.join(process.cwd(), 'subreddits.txt'), 'utf8')
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
        .sort();
    } catch {
      subredditList = [];
    }
  }
  const needle = prefix.toLowerCase();
  let lo = 0;
  let hi = subredditList.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (subredditList[mid] < needle) lo = mid + 1;
    else hi = mid;
  }
  const matches = [];
  for (let i = lo; i < subredditList.length && subredditList[i].startsWith(needle) && matches.length < 200; i++) {
    matches.push(subredditList[i]);
  }
  return matches
    .sort((a, b) => a.length - b.length)
    .slice(0, 8)
    .map((name) => ({ name, posts: null }));
}

export default async function handler(req, res) {
  // Rate limiting
  const ip = getClientIp(req);
  if (!checkRateLimit(req, ip, 200, 60000)) {
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  const { query, startDate, endDate } = req.query;

  if (!query) return res.status(400).json({ error: 'Query parameter "query" is required' });
  if (query.length > 100) return res.status(400).json({ error: 'Query too long' });
  if (!/^[a-zA-Z0-9_.]+$/.test(query)) return res.status(200).json({ suggestions: [] });

  try {
    if (!(await hasTable('subreddits_metadata'))) {
      return res.status(200).json({ suggestions: searchSubredditList(query) });
    }

    const pool = await connectToDatabase();
    const params = [query.toLowerCase()];
    let where = `lower(name) LIKE $1 || '%'`;

    // Very short prefixes match thousands of names; only offer established communities
    if (query.length === 1) where += ' AND entry_count > 60';
    else if (query.length === 2) where += ' AND entry_count > 12';

    if (isMonth(startDate) && isMonth(endDate)) {
      params.push(`${startDate}-01`, `${endDate}-01`);
      where += ` AND last_seen >= $2::date AND first_seen <= $3::date`;
    }

    // Exact match first, then by archived post count
    const result = await pool.query(
      `SELECT name, post_count
         FROM subreddits_metadata
        WHERE ${where}
        ORDER BY (lower(name) = $1) DESC, post_count DESC, length(name)
        LIMIT 8`,
      params
    );
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).json({
      suggestions: result.rows.map((row) => ({ name: row.name, posts: Number(row.post_count) })),
    });
  } catch (error) {
    console.error('Error fetching search suggestions:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
}
