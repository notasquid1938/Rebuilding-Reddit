import connectToDatabase from '../../db';

// Define the columns to select from each table
const selectedColumns = ['author', 'created_utc', 'score', 'id', 'subreddit', 'title', 'url'];

export default async function handler(req, res) {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const subreddit = req.query.subreddit;
    const page = req.query.page || 1;
    const pageSize = 10;
    const offset = (page - 1) * pageSize;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required query parameters' });
    }

    const db = await connectToDatabase();

    const startYear = parseInt(startDate.split('-')[0]);
    const startMonth = parseInt(startDate.split('-')[1]);
    const endYear = parseInt(endDate.split('-')[0]);
    const endMonth = parseInt(endDate.split('-')[1]);

    const tableNames = [];
    for (let year = startYear; year <= endYear; year++) {
      const startM = (year === startYear) ? startMonth : 1;
      const endM = (year === endYear) ? endMonth : 12;

      for (let month = startM; month <= endM; month++) {
        const formattedMonth = month < 10 ? `0${month}` : `${month}`;
        tableNames.push(`RS_${year}_${formattedMonth}`);
      }
    }

    // Construct the UNION ALL query to fetch data from all tables
    let unionQuery = '';
    for (let i = 0; i < tableNames.length; i++) {
      // Construct the SELECT statement with selected columns
      const columnsToSelect = selectedColumns.map(col => `${col}`);
      unionQuery += `SELECT ${columnsToSelect.join(',')} FROM ${tableNames[i]}`;
      if (i !== tableNames.length - 1) {
        unionQuery += ' UNION ALL ';
      }
    }

    // Rank all posts from all tables collectively and limit to pageSize
    let query = `SELECT * FROM (${unionQuery}) AS all_posts`;
    if (subreddit && subreddit.toLowerCase() !== 'all') {
      query += ` WHERE subreddit = '${subreddit.toLowerCase()}'`;
    }
    query += ` ORDER BY score DESC LIMIT ${pageSize} OFFSET ${offset}`;

    const { rows } = await db.query(query);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
