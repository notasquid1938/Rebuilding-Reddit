import os
from pymongo import MongoClient

# MongoDB connection details
mongo_url = "mongodb://localhost:27017"
mongo_db_name = "Rebuild-Reddit"

# Connect to MongoDB
client = MongoClient(mongo_url)
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

# Counter for batch numbering
batch_counter = 1

# Counter for lines written to the current file
lines_counter = 0

# Iterate over collections starting with "RS_"
for collection_name in db.list_collection_names(filter={"name": {"$regex": "^RS_"}}):
    collection = db[collection_name]
    
    # Fetch ids in batches
    for id_batch in fetch_ids_in_batches(collection, batch_size):
        # Check if the lines_counter exceeds 50,000
        if lines_counter >= 50000:
            # If so, increment the batch_counter and reset lines_counter
            batch_counter += 1
            lines_counter = 0
        
        file_path = os.path.join(output_directory, f"{batch_counter}.txt")
        write_ids_to_file(id_batch, file_path)
        lines_counter += len(id_batch)

# Close MongoDB connection
client.close()
