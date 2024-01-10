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

    const allComments = [];

    // Iterate through RC collections and find comments with the specified link_id
    for (const collectionInfo of collections) {
      if (collectionInfo.name.startsWith('RC')) {
        const collection = db.collection(collectionInfo.name);
        const matchingComments = await collection
          .find({ link_id: `t3_${id}` })
          .toArray();

        if (matchingComments.length > 0) {
          allComments.push(...matchingComments);
        }
      }
    }

    // Log total comment count
    console.log('Total comment count:', allComments.length);

    // Sort all comments by score in descending order
    const sortedComments = allComments.sort((a, b) => b.score - a.score);

    // Calculate the start and end index for the requested page
    const startIndex = (page - 1) * commentsPerPage;
    const endIndex = startIndex + commentsPerPage;

    // Extract the comments for the requested page
    const comments = sortedComments.slice(startIndex, endIndex);

    return res.status(200).json(comments);
  } catch (error) {
    console.error('Error fetching comments data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
