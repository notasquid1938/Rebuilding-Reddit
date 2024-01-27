import connectToDatabase from '@/db';

export default async function handler(req, res) {
  try {
    // Extract the batch count from the request query
    const { batch } = req.query;

    // Connect to the MongoDB database
    const db = await connectToDatabase();

    // Determine the starting index based on the batch count
    const batchSize = 50000;
    const skipCount = (batch - 1) * batchSize;

    // Fetch documents from the RS_All collection
    const documents = await db.collection('RS_All')
                             .find({}, { projection: { _id: 0, id: 1 } }) // Exclude _id, include id
                             .skip(skipCount)
                             .limit(batchSize)
                             .toArray();

    // Extract id fields from the documents
    const batchIds = documents.map(doc => doc.id);

    // Send JSON response
    res.status(200).json(batchIds);
  } catch (error) {
    console.error('Error connecting to the database or processing data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
