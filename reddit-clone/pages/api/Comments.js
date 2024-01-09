import connectToDatabase from '../../db';

export default async function handler(req, res) {
  try {
    const { id } = req.query;

    if (!id) {
      return res.status(400).json({ error: 'Missing post ID' });
    }

    const db = await connectToDatabase();
    const collection = db.collection('RS_2008-12');

    // Find the post with the specified ID
    const post = await collection.findOne({ id: id });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.status(200).json(post);
  } catch (error) {
    console.error('Error fetching post data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
