import connectToDatabase from '../../db-mongodb';

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    const collections = await db.listCollections().toArray();

    // Iterate through RS collections and find the post with the specified ID
    for (const collectionInfo of collections) {
      if (collectionInfo.name.startsWith('RS')) {
        const collection = db.collection(collectionInfo.name);
        const post = await collection.findOne({ id: id });

        if (post) {
          return res.status(200).json(post);
        }
      }
    }

    // If no matching post is found in any collection
    return res.status(404).json({ error: 'Post not found' });
  } catch (error) {
    console.error('Error fetching post data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
