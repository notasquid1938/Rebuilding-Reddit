import connectToDatabase from '../../db';

export default async function handler(req, res) {
  try {
    const db = await connectToDatabase();
    const collection = db.collection('RS_2008-12');

    // Sort by 'score' in descending order and limit to top 100
    const data = await collection.find({}).sort({ score: -1 }).limit(100).toArray();

    res.status(200).json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
