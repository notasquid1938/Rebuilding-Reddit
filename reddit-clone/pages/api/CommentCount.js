import connectToDatabase from '../../db-mongodb';

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    const collections = await db.listCollections().toArray();

    let totalComments = 0;

    // Iterate through RC collections and find comments with the specified link_id
    for (const collectionInfo of collections) {
      if (collectionInfo.name.startsWith('RC')) {
        const collection = db.collection(collectionInfo.name);
        const matchingCommentsCount = await collection
          .countDocuments({ link_id: `t3_${id}` });

        totalComments += matchingCommentsCount;
      }
    }

    return res.status(200).json({ totalComments });
  } catch (error) {
    console.error('Error fetching comments data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
