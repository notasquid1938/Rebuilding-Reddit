import connectToDatabase from '../../db-mongodb';

export default async function handler(req, res) {
  try {
    const { id, page = 1 } = req.query;
    const commentsPerPage = 1;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    const collections = await db.listCollections().toArray();

    // Fetch all replies under the post
    const allReplies = [];
    for (const collectionInfo of collections) {
      if (collectionInfo.name.startsWith('RC')) {
        const collection = db.collection(collectionInfo.name);
        const matchingReplies = await collection
          .find({ link_id: `t3_${id}` })
          .toArray();
        allReplies.push(...matchingReplies);
      }
    }

    const allComments = await fetchCommentsWithReplies(db, id, collections, allReplies);

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

async function fetchCommentsWithReplies(db, postId, collections, allReplies) {
  const allComments = [];

  async function fetchRepliesRecursively(comment) {
    comment.replies = [];

    for (const reply of allReplies) {
      if (reply.parent_id === `t1_${comment.id}`) {
        const nestedReplies = await fetchRepliesRecursively(reply);
        comment.replies.push({ ...reply, replies: nestedReplies });
      }
    }

    return comment.replies;
  }

  for (const collectionInfo of collections) {
    if (collectionInfo.name.startsWith('RC')) {
      const collection = db.collection(collectionInfo.name);
      const matchingComments = await collection
        .find({ parent_id: `t3_${postId}` })
        .toArray();

      for (const comment of matchingComments) {
        const replies = await fetchRepliesRecursively(comment);
        allComments.push({ ...comment, replies });
      }
    }
  }

  return allComments;
}
