import connectToDatabase from '@/db';

export default async function handler(req, res) {
  try {
    // Extract the batch count from the request query
    let { batch } = req.query;

    // Check if batch is not a number, return a 400 Bad Request response
    if (isNaN(batch)) {
      return res.status(400).json({ error: 'Batch parameter must be a number' });
    }

    // Convert batch to a number
    batch = parseInt(batch);

    // Connect to the PostgreSQL database
    const db = await connectToDatabase();

    // Determine the starting index based on the batch count
    const batchSize = 5000;
    const skipCount = (batch - 1) * batchSize;

    // Construct the SQL query to select ids from tables starting with 'rs'
    const queryText = `
      SELECT id FROM (
        ${await generateUnionQuery('rs')}
      ) AS combined_tables
      OFFSET $1
      LIMIT $2;
    `;

    const queryValues = [skipCount, batchSize];

    // Execute the query
    const result = await db.query(queryText, queryValues);

    // Extract id fields from the result
    const batchIds = result.rows.map(row => row.id);

    // Send JSON response
    res.status(200).json(batchIds);
  } catch (error) {
    // Send a 500 Internal Server Error response
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

async function generateUnionQuery(prefix) {
  const db = await connectToDatabase();

  // Fetch tables starting with the specified prefix
  const queryText = `
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE $1;
  `;
  const queryValues = [`${prefix}%`];

  const result = await db.query(queryText, queryValues);

  // Construct the union query
  let unionQuery = '';
  for (const row of result.rows) {
    const tableName = row.table_name;
    unionQuery += `(SELECT id FROM ${tableName}) UNION ALL `;
  }

  // Remove the last 'UNION ALL' from the query
  unionQuery = unionQuery.slice(0, -10);

  return unionQuery;
}
