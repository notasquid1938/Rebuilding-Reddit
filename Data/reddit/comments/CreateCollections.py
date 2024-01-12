import os
import json
from pymongo import MongoClient

# Connect to MongoDB
client = MongoClient('mongodb://localhost:27017/')
db = client['Rebuild-Reddit']

# Get the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))

# Loop through each JSON file in the current directory
for filename in os.listdir(current_dir):
    if filename.endswith('.json'):
        collection_name = os.path.splitext(filename)[0]

        # Check if the collection already exists
        if collection_name in db.list_collection_names():
            print(f"Collection '{collection_name}' already exists. Skipping...")
            continue

        # Read JSON file and insert data into MongoDB
        with open(os.path.join(current_dir, filename), 'r') as file:
            for line in file:
                json_data = json.loads(line)
                db[collection_name].insert_one(json_data)

        print(f"Collection '{collection_name}' created successfully.")

# Close MongoDB connection
client.close()
