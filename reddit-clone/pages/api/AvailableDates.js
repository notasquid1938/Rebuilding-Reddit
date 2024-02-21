import connectToDatabase from "@/db";

export default async function handler(req, res) {
  try {
    const db = await connectToDatabase();
    
    // Query to fetch table names starting with 'RS'
    const query = `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_catalog = 'Reddit-Rebuilt'
      AND table_schema = 'public'
      AND table_name LIKE 'RS%';
    `;

    const result = await db.query(query);
    const rsCollections = result.rows.map(row => row.table_name.replace(/^RS_/, ''));

    res.status(200).json({ collections: rsCollections });
  } catch (error) {
    console.error('Error fetching available dates:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
