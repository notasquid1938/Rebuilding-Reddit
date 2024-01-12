from pymongo import MongoClient
from pymongo.errors import OperationFailure

# Connect to MongoDB
client = MongoClient('mongodb://localhost:27017/')
db = client['Rebuild-Reddit']

# Get a list of collection names
collection_names = db.list_collection_names()

# Iterate through collections starting with 'RS'
for collection_name in collection_names:
    if collection_name.startswith('RS'):
        collection = db[collection_name]
        
        # Check if the index already exists for 'score' field
        try:
            collection.create_index([('score', -1)], name='score_index', unique=False)
            print(f"Descending index created for 'score' field in collection: {collection_name}")
        except OperationFailure as e:
            if "Index with name: score_index already exists" in str(e):
                print(f"Descending index for 'score' field already exists in collection: {collection_name}")
            else:
                print(f"Error creating index for 'score' field in collection {collection_name}: {e}")

        # Check if the index already exists for 'id' field
        try:
            collection.create_index([('id', 1)], name='id_index', unique=False)
            print(f"Ascending index created for 'id' field in collection: {collection_name}")
        except OperationFailure as e:
            if "Index with name: link_id_index already exists" in str(e):
                print(f"Ascending index for 'id' field already exists in collection: {collection_name}")
            else:
                print(f"Error creating index for 'id' field in collection {collection_name}: {e}")

        # Check if the index already exists for 'subreddit' field
        try:
            collection.create_index([('subreddit', 1)], name='subreddit_index', unique=False)
            print(f"Ascending index created for 'subreddit' field in collection: {collection_name}")
        except OperationFailure as e:
            if "Index with name: subreddit_index already exists" in str(e):
                print(f"Ascending index for 'subreddit' field already exists in collection: {collection_name}")
            else:
                print(f"Error creating index for 'subreddit' field in collection {collection_name}: {e}")

# Close MongoDB connection
client.close()
