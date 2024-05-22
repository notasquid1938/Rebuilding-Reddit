import connectToDatabase from '../../db';

export default async function handler(req, res) {
  const { query } = req.query;

  if (!query) {
    return res.status(400).json({ error: 'Query parameter "query" is required' });
  }

  let client; // Define client variable outside try block

  try {
    const pool = await connectToDatabase();
    client = await pool.connect(); // Assign client inside try block

    const selectQuery = `
      SELECT subreddit
      FROM subreddits
      WHERE subreddit ILIKE $1 || '%'  -- Match subreddit names starting with the query
      LIMIT 5
    `;

    const result = await client.query(selectQuery, [query]);

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
