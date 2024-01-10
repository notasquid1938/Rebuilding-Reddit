import connectToDatabase from '../../db';

export default async function handler(req, res) {
  try {
    const { id, page = 1 } = req.query;
    const commentsPerPage = 20;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    const collections = await db.listCollections().toArray();

    const comments = [];

    // Iterate through RC collections and find comments with the specified link_id
    for (const collectionInfo of collections) {
      if (collectionInfo.name.startsWith('RC')) {
        const collection = db.collection(collectionInfo.name);
        const matchingComments = await collection
          .find({ link_id: `t3_${id}` })
          .sort({ score: -1 }) // Sort comments by score in descending order
          .skip((page - 1) * commentsPerPage + (page === 1 ? 0 : 1)) // Adjust skip logic for the first page
          .limit(commentsPerPage)
          .toArray();

        if (matchingComments.length > 0) {
          comments.push(...matchingComments);
        }
      }
    }

    return res.status(200).json(comments);
  } catch (error) {
    console.error('Error fetching comments data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
