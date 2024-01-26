import connectToDatabase from '@/db';

export default async function handler(req, res) {
  try {
    // Extract the batch count from the request query
    const { batch } = req.query;
    // Connect to the MongoDB database
    const db = await connectToDatabase();

    // Get the collection names in the database
    const collections = await db.listCollections().toArray();

    // Filter collections starting with "RS"
    const rsCollections = collections
      .filter((collection) => collection.name.startsWith('RS'))
      .map((collection) => collection.name);

    // Prepare JSON response with batch ids
    const responseData = [];

    // Determine the starting index based on the batch count
    const skipCount = (batch - 1) * 100;

    // Loop through collections and fetch batch IDs
    for (const collectionName of rsCollections) {
      // Fetch documents from the collection with only the id field
      const documents = await db.collection(collectionName)
                                 .aggregate([
                                    { $project: { id: '$_id' } }, // Project _id as id
                                    { $skip: skipCount }, // Skip documents
                                    { $limit: 100 } // Limit documents
                                  ])
                                 .toArray();
      // Extract id fields from the documents
      const batchIds = documents.map(doc => doc.id);
      // Add batch IDs to the response data
      responseData.push(...batchIds);
    }

    // Send JSON response
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error connecting to the database or processing data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
