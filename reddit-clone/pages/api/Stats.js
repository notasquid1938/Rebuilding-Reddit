import fs from 'fs';
import path from 'path';
import connectToDatabase from '../../db';

export default async function handler(req, res) {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const subreddit = req.query.subreddit;
    const db = await connectToDatabase();
    let tableNames = [];

    if (startDate && endDate) {
      const startYear = parseInt(startDate.split('-')[0]);
      const startMonth = parseInt(startDate.split('-')[1]);
      const endYear = parseInt(endDate.split('-')[0]);
      const endMonth = parseInt(endDate.split('-')[1]);
      for (let year = startYear; year <= endYear; year++) {
        const startM = (year === startYear) ? startMonth : 1;
        const endM = (year === endYear) ? endMonth : 12;
        for (let month = startM; month <= endM; month++) {
          const formattedMonth = month < 10 ? `0${month}` : `${month}`;
          tableNames.push(`rs_${year}_${formattedMonth}`);
        }
      }
    } else {
      // Fetch all table names that start with 'rs_'
      const result = await db.query("SELECT tablename FROM pg_tables WHERE tablename LIKE 'rs_%'");
      tableNames = result.rows.map(row => row.tablename);
    }

    if (tableNames.length === 0) {
      return res.status(404).json({ error: 'No tables found for the given date range' });
    }

    // Construct the UNION ALL query to fetch data from all tables
    let unionQuery = tableNames.map(tableName => 
      `SELECT author, subreddit FROM ${tableName}`
    ).join(' UNION ALL ');

    // Build the main query to fetch stats
    let query = `
      WITH all_posts AS (${unionQuery})
      SELECT
        COUNT(*) AS total_posts,
        COUNT(DISTINCT author) AS unique_users,
        subreddit,
        COUNT(*) AS subreddit_posts
      FROM all_posts
    `;

    if (subreddit && subreddit !== 'all') {
      query += ` WHERE subreddit = '${subreddit}'`;
    }

    query += `
      GROUP BY subreddit
      ORDER BY subreddit_posts DESC
      LIMIT 10
    `;

    // Run EXPLAIN ANALYZE for the main query and save to logs
    const explainAnalyzeMain = await db.query(`EXPLAIN ANALYZE ${query}`);
    logExplainAnalyze(explainAnalyzeMain.rows, 'Main Query');

    // Execute the main query
    const { rows } = await db.query(query);

    // Extract the required stats
    const totalPosts = rows.reduce((acc, row) => acc + parseInt(row.subreddit_posts), 0);
    const uniqueUsers = parseInt(rows[0].unique_users);

    // Top 10 subreddits are already sorted by the SQL query
    const topSubreddits = rows.map(row => ({
      subreddit: row.subreddit,
      posts: parseInt(row.subreddit_posts)
    }));

    // For top users, we need a separate query
    const topUsersQuery = `
      WITH all_posts AS (${unionQuery})
      SELECT author, COUNT(*) as post_count
      FROM all_posts
      ${subreddit && subreddit !== 'all' ? `WHERE subreddit = '${subreddit}'` : ''}
      GROUP BY author
      ORDER BY post_count DESC
      LIMIT 10
    `;

    // Run EXPLAIN ANALYZE for the top users query and save to logs
    const explainAnalyzeTopUsers = await db.query(`EXPLAIN ANALYZE ${topUsersQuery}`);
    logExplainAnalyze(explainAnalyzeTopUsers.rows, 'Top Users Query');

    const topUsersResult = await db.query(topUsersQuery);
    const topUsers = topUsersResult.rows.map(row => ({
      user: row.author,
      posts: parseInt(row.post_count)
    }));

    // Send the stats in the response
    res.status(200).json({
      totalPosts,
      uniqueUsers,
      topSubreddits,
      topUsers
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

// Function to log EXPLAIN ANALYZE results to stats-log.txt
function logExplainAnalyze(explainRows, queryName) {
  const logPath = path.join(__dirname, '../../../../logs/stats-log.txt');
  const logContent = `
[${new Date().toISOString()}] - ${queryName}
${explainRows.map(row => row['QUERY PLAN']).join('\n')}
`;

  fs.appendFileSync(logPath, logContent, 'utf8');
}
