import os
from pymongo import MongoClient

# MongoDB connection details
mongo_host = "mongodb://localhost:27017"
mongo_port = 27017
mongo_db_name = "Reddit-Rebuilt"

# Connect to MongoDB
client = MongoClient(mongo_host, mongo_port)
db = client[mongo_db_name]

# Function to write ids to a text file
def write_ids_to_file(ids, file_path):
    with open(file_path, 'w') as file:
        file.write('\n'.join(ids))

# Function to fetch ids in batches
def fetch_ids_in_batches(collection, batch_size):
    ids = []
    for doc in collection.find({}, {"id": 1}):
        ids.append(str(doc.get("id", "")))
        if len(ids) == batch_size:
            yield ids
            ids = []
    if ids:
        yield ids

# Output directory
output_directory = "./Data/sitemap/ids/"
os.makedirs(output_directory, exist_ok=True)

# Batch size for fetching ids
batch_size = 50000

# Iterate over collections starting with "RS_"
for collection_name in db.list_collection_names(filter={"name": {"$regex": "^RS_"}}):
    collection = db[collection_name]
    
    # Fetch ids in batches
    for i, id_batch in enumerate(fetch_ids_in_batches(collection, batch_size)):
        file_path = os.path.join(output_directory, f"{collection_name}_{i + 1}.txt")
        write_ids_to_file(id_batch, file_path)

# Close MongoDB connection
client.close()
