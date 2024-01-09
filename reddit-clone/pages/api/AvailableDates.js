import connectToDatabase from '../../db';

export default async function handler(req, res) {
  try {
    const db = await connectToDatabase();
    
    // Fetch collection names starting with 'RS'
    const collections = await db.listCollections().toArray();
    const rsCollections = collections
      .filter(collection => collection.name.startsWith('RS'))
      .map(collection => collection.name.replace(/^RS_/, ''));

    res.status(200).json({ collections: rsCollections });
  } catch (error) {
    console.error('Error fetching available dates:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
