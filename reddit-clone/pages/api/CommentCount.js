import connectToDatabase from '@/db';

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    
    let totalComments = 0;

    // Iterate through tables and find comments with the specified link_id
    const client = await db.connect();
    try {
      const result = await client.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'rc%'`
      );

      const tables = result.rows.map(row => row.table_name);

      for (const table of tables) {
        const queryResult = await client.query(
          `SELECT COUNT(*) FROM "${table}" WHERE link_id = 't3_${id}'`
          // Double quotes around the table name to handle hyphen
        );

        totalComments += parseInt(queryResult.rows[0].count);
      }
    } finally {
      client.release();
    }

    return res.status(200).json({ totalComments });
  } catch (error) {
    console.error('Error fetching comments data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
