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
    let unionQuery = '';
    for (let i = 0; i < tableNames.length; i++) {
      unionQuery += `SELECT author, subreddit FROM ${tableNames[i]}`;
      if (i !== tableNames.length - 1) {
        unionQuery += ' UNION ALL ';
      }
    }

    // Build the main query to fetch stats
    let query = `SELECT 
                    COUNT(*) AS total_posts, 
                    COUNT(DISTINCT author) AS unique_users,
                    COUNT(*) FILTER (WHERE subreddit = '${subreddit}') AS subreddit_posts,
                    subreddit,
                    author
                 FROM (${unionQuery}) AS all_posts`;
    
    if (subreddit && subreddit !== 'all') {
      query += ` WHERE subreddit = '${subreddit}'`;
    }
    
    query += ` GROUP BY subreddit, author`;

    // Execute the main query
    const { rows } = await db.query(query);

    // Extract the required stats
    const totalPosts = rows.reduce((acc, row) => acc + parseInt(row.total_posts), 0);
    const uniqueUsers = rows.reduce((acc, row) => acc + parseInt(row.unique_users), 0);

    // Calculate top 10 subreddits and top 10 users by post count
    const topSubreddits = rows
      .reduce((acc, row) => {
        if (!acc[row.subreddit]) {
          acc[row.subreddit] = parseInt(row.subreddit_posts);
        } else {
          acc[row.subreddit] += parseInt(row.subreddit_posts);
        }
        return acc;
      }, {});

    const topUsers = rows
      .reduce((acc, row) => {
        if (!acc[row.author]) {
          acc[row.author] = parseInt(row.total_posts);
        } else {
          acc[row.author] += parseInt(row.total_posts);
        }
        return acc;
      }, {});

    const sortedTopSubreddits = Object.entries(topSubreddits)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => ({ subreddit: entry[0], posts: entry[1] }));

    const sortedTopUsers = Object.entries(topUsers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => ({ user: entry[0], posts: entry[1] }));

    // Send the stats in the response
    res.status(200).json({
      totalPosts,
      uniqueUsers,
      topSubreddits: sortedTopSubreddits,
      topUsers: sortedTopUsers
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
