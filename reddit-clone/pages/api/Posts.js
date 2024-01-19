import connectToDatabase from '../../db';

export default async function handler(req, res) {
  try {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const subreddit = req.query.subreddit;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required query parameters' });
    }

    const db = await connectToDatabase();
    
    const startYear = startDate.split('-')[0];
    const endYear = endDate.split('-')[0];
    const startMonth = startDate.split('-')[1];
    const endMonth = endDate.split('-')[1];

    const collectionNames = [];
    for (let year = parseInt(startYear); year <= parseInt(endYear); year++) {
      const startM = year === parseInt(startYear) ? parseInt(startMonth) : 1;
      const endM = year === parseInt(endYear) ? parseInt(endMonth) : 12;
    
      for (let month = startM; month <= endM; month++) {
        const formattedMonth = month < 10 ? `0${month}` : `${month}`;
        collectionNames.push(`RS_${year}-${formattedMonth}`);
      }
    }

    // Fetch top 100 posts from each collection
    const topPosts = [];
    for (const collectionName of collectionNames) {
      const collection = db.collection(collectionName);
      let findQuery = {};
      
      if (subreddit && subreddit.toLowerCase() !== 'all') {
        // Add subreddit condition if provided and not 'all'
        findQuery = { subreddit: subreddit.toLowerCase() };
      }

      const data = await collection.find(findQuery).sort({ score: -1 }).limit(100).toArray();
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