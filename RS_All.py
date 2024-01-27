from pymongo import MongoClient

def merge_collections(source_db_name, target_collection_name, batch_size=100000):
    # Connect to MongoDB
    client = MongoClient('localhost', 27017)  # Assuming MongoDB is running locally
    source_db = client[source_db_name]
    target_collection = source_db[target_collection_name]

    # Get the list of collections starting with 'RS'
    source_collections = source_db.list_collection_names(filter={"name": {"$regex": "^RS"}})

    for collection_name in source_collections:
        # Get the collection
        source_collection = source_db[collection_name]

        # Get the total number of documents in the collection
        total_documents = source_collection.count_documents({})

        # Paginate through the collection and process documents in batches
        for i in range(0, total_documents, batch_size):
            # Retrieve documents from the source collection in batches
            documents = source_collection.find().skip(i).limit(batch_size)

            # Insert documents into the target collection
            target_collection.insert_many(documents)

            print(f"Processed {min(i + batch_size, total_documents)} documents "
                  f"from {source_db_name}.{collection_name}")

    client.close()

if __name__ == "__main__":
    source_db_name = "Rebuild-Reddit"
    target_collection_name = "RS_All"
    merge_collections(source_db_name, target_collection_name)
