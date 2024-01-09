import connectToDatabase from '../../db';

export default async function handler(req, res) {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required query parameters' });
    }

    const db = await connectToDatabase();
    
    // Extract year and month from start and end dates
    const startYear = startDate.split('-')[0];
    const endYear = endDate.split('-')[0];
    const startMonth = startDate.split('-')[1];
    const endMonth = endDate.split('-')[1];

    // Generate collection names between start and end dates
    const collectionNames = [];
    for (let year = parseInt(startYear); year <= parseInt(endYear); year++) {
      for (let month = parseInt(startMonth); month <= parseInt(endMonth); month++) {
        const formattedMonth = month < 10 ? `0${month}` : `${month}`;
        collectionNames.push(`RS_${year}-${formattedMonth}`);
      }
    }

    // Fetch top 100 posts from each collection
    const topPosts = [];
    for (const collectionName of collectionNames) {
      const collection = db.collection(collectionName);
      const data = await collection.find({}).sort({ score: -1 }).limit(100).toArray();
      topPosts.push(...data);
    }

    // Sort all posts by 'score' in descending order and limit to top 100
    const sortedPosts = topPosts.sort((a, b) => b.score - a.score).slice(0, 100);

    res.status(200).json(sortedPosts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
