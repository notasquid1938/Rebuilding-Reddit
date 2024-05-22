import connectToDatabase from '../../db';

export default async function handler(req, res) {
  const { query } = req.query;
  const { startDate } = req.query;
  const { endDate } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  let client; // Define client variable outside try block

  try {
    const pool = await connectToDatabase();
    client = await pool.connect(); // Assign client inside try block

    // Base SQL query
    let selectQuery = `
      SELECT subreddit
      FROM subreddits
      WHERE subreddit ILIKE $1 || '%'  -- Match subreddit names starting with the query
    `;

    // Append date range conditionally
    if (startDate && endDate) {
      selectQuery += `
        AND EXISTS (
          SELECT 1
          FROM unnest(found_in_tables) AS found_in_table
          WHERE to_date(found_in_table, 'YYYY_MM') BETWEEN to_date($2, 'YYYY_MM') AND to_date($3, 'YYYY_MM')
        )
      `;
    }

    selectQuery += 'LIMIT 5';

    // Execute query with or without date parameters
    const result = startDate && endDate
      ? await client.query(selectQuery, [query, startDate, endDate])
      : await client.query(selectQuery, [query]);

    // Extract subreddit suggestions from the query result
    const suggestions = result.rows.map(row => row.subreddit);

    res.status(200).json({ suggestions });
  } catch (error) {
    console.error('Error fetching search suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    // Release the client back to the pool if it's defined
    if (client) {
      client.release();
    }
  }
}
