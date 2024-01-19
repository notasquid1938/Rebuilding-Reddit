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

        # Read JSON file and insert data into MongoDB in batches of 10,000
        with open(os.path.join(current_dir, filename), 'r') as file:
            batch_size = 100000
            json_data_list = []

            for line in file:
                try:
                    json_data = json.loads(line)
                    json_data_list.append(json_data)

                    # Insert batch into MongoDB when it reaches 10,000
                    if len(json_data_list) == batch_size:
                        db[collection_name].insert_many(json_data_list)
                        json_data_list = []

                except json.JSONDecodeError as e:
                    print(f"Error decoding JSON in file '{filename}': {e}.")
                    continue

            # Insert any remaining data (less than 10,000) into MongoDB
            if json_data_list:
                db[collection_name].insert_many(json_data_list)

        print(f"Finished processing collection: {collection_name}")

# Close MongoDB connection
client.close()

