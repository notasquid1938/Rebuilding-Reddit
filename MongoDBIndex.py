from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient('mongodb://localhost:27017')
database_name = 'Rebuild-Reddit'
database = client[database_name]

# Get a list of collection names
collection_names = database.list_collection_names()

# Iterate through collections starting with 'RS'
for collection_name in collection_names:
    if collection_name.startswith('RS'):
        collection = database[collection_name]

        # Create a descending index for the 'score' field
        collection.create_index([('score', -1)])

        print(f"Index created for 'score' field in collection: {collection_name}")

# Close the MongoDB connection
client.close()
