import fs from 'fs';
import path from 'path';
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
      // Construct the SELECT statement with selected columns
      const columnsToSelect = selectedColumns.map(col => `${col}`);
      unionQuery += `SELECT ${columnsToSelect.join(',')} FROM ${tableNames[i]}`;
      if (i !== tableNames.length - 1) {
        unionQuery += ' UNION ALL ';
      }
    }

    // Construct the main query
    let query = `SELECT * FROM (${unionQuery}) AS all_posts`;
    if (subreddit && subreddit !== 'all') {
      query += ` WHERE subreddit = '${subreddit}'`; // Removed .toLowerCase()
    }
    query += ` ORDER BY score DESC LIMIT ${pageSize} OFFSET ${offset}`;

    // Write the query to the log file
    const logFilePath = path.join(__dirname, '../../../../logs/posts-log.txt');
    fs.writeFileSync(logFilePath, `${query}\n`, { flag: 'w' });

    const explainQuery = `EXPLAIN (ANALYZE, COSTS, FORMAT JSON) ${query}`;

    // Execute the explain query
    const explainResult = await db.query(explainQuery);

    // Append the explain results to the log file
    fs.writeFileSync(logFilePath, JSON.stringify(explainResult.rows) + '\n', { flag: 'a' });

    // Execute the main query
    const { rows } = await db.query(query);
    res.status(200).json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
