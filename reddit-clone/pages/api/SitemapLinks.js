import connectToDatabase from '@/db-mongodb';

export default async function handler(req, res) {
  try {
    // Connect to the MongoDB database
    const db = await connectToDatabase();

    // Get the collection names in the database
    const collections = await db.listCollections().toArray();

    // Filter collections starting with "RS"
    const rsCollections = collections
      .filter((collection) => collection.name.startsWith('RS'))
      .map((collection) => collection.name);

    // Calculate the total number of documents across all RS collections
    let totalDocuments = 0;

    for (const collectionName of rsCollections) {
      const collectionDocuments = await db.collection(collectionName).estimatedDocumentCount();
      //estimatedDocumentCount is instant and accurate within 50k (tested at 15 Million documents)
      totalDocuments += collectionDocuments;
    }

    // Calculate batch count based on the total number of documents
    const batchCount = Math.ceil(totalDocuments / 50000);

    // Prepare JSON response with batch ids
    const responseData = [];

    for (let i = 1; i <= batchCount; i++) {
      responseData.push({
        id: i,
      });
    }

    // Send JSON response
    res.status(200).json(responseData);
  } catch (error) {
    console.error('Error connecting to the database or processing data:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
