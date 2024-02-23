import connectToDatabase from '@/db';

export default async function handler(req, res) {
  try {
    // Connect to the PostgreSQL database
    const db = await connectToDatabase();

    // Query for collections starting with "RS"
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'rs%';
    `;

    // Execute the query
    const result = await db.query(query);

    const rsCollections = result.rows.map(row => row.table_name);

    // Calculate the total number of documents across all RS collections
    let totalDocuments = 0;

    for (const tableName of rsCollections) {
      const countQuery = `SELECT COUNT(*) FROM ${tableName};`;
      const countResult = await db.query(countQuery);
      const collectionDocuments = parseInt(countResult.rows[0].count, 10);
      totalDocuments += collectionDocuments;
    }

    // Calculate batch count based on the total number of documents
    const batchSize = 50000;
    const batchCount = Math.ceil(totalDocuments / batchSize);

    // Prepare JSON response with batch ids
    const responseData = Array.from({ length: batchCount }, (_, index) => ({ id: index + 1 }));

    // Send JSON response
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error connecting to the database or processing data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
