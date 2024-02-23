import connectToDatabase from '../../db';

// Define the columns to search in each table
const columnsToSearch = ['id', 'score', 'url', 'created_utc', 'title', 'subreddit', 'author', 'selftext']; // Adjust as per your schema

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    const client = await db.connect();

    // Get a list of tables beginning with lowercase 'rs'
    const queryTablesText = `SELECT table_name
                             FROM information_schema.tables
                             WHERE table_schema = 'public' 
                             AND table_name LIKE 'rs%'`;

    const tablesResult = await client.query(queryTablesText);
    const tables = tablesResult.rows.map(row => row.table_name);

    if (tables.length === 0) {
      return res.status(404).json({ error: 'No matching tables found' });
    }

    // Construct dynamic SQL query with UNION
    let unionQuery = '';
    tables.forEach((table, index) => {
      // Constructing the SELECT statement dynamically
      const selectColumns = columnsToSearch.map(column => `"${column}"`).join(', ');
      unionQuery += `SELECT ${selectColumns} FROM ${table} WHERE id = $${index + 1} UNION `;
    });

    // Remove the last 'UNION ' string from the query
    unionQuery = unionQuery.slice(0, -7);

    const values = new Array(tables.length).fill(id);
    const result = await client.query(unionQuery, values);
    client.release();

    if (result.rows && result.rows.length > 0) {
      return res.status(200).json(result.rows[0]);
    } else {
      return res.status(404).json({ error: 'Post not found' });
    }
  } catch (error) {
    console.error('Error fetching post data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
