##CMD To turn every file into JSON:
##for %i in (*.) do ren "%i" "%i.json"

import os
import json
from pymongo import MongoClient
from pymongo.errors import OperationFailure

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
        with open(os.path.join(current_dir, filename), 'r', encoding='utf-8') as file:
            for line_number, line in enumerate(file, start=1):
                try:
                    json_data = json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"Error decoding JSON in file '{filename}' at line {line_number}: {e}.")
                    print(f"Problematic JSON content: {line}")
                    continue

                db[collection_name].insert_one(json_data)

        print(f"Finished processing collection: {collection_name}")

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

        # Check if the index already exists for 'link_id' field
        try:
            collection.create_index([('id', 1)], name='id_index', unique=False)
            print(f"Ascending index created for 'id' field in collection: {collection_name}")
        except OperationFailure as e:
            if "Index with name: link_id_index already exists" in str(e):
                print(f"Ascending index for 'id' field already exists in collection: {collection_name}")
            else:
                print(f"Error creating index for 'id' field in collection {collection_name}: {e}")

# Close MongoDB connection
client.close()
