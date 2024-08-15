import os
import json
import psycopg2
from psycopg2 import sql, OperationalError
import subprocess
import time
from datetime import datetime

def decompress_zst(zst_file):
    base_name = os.path.splitext(zst_file)[0].lower()
    json_file = f"{base_name.replace('-', '_')}.json"
    print(f"Decompressing {zst_file}...")
    try:
        subprocess.run(['zstd', '-d', zst_file, '-o', json_file, '--long=31'], check=True)
        print(f"Decompression complete: {json_file}")
        os.remove(zst_file)  # Delete zst file immediately after decompression
        print(f"Deleted zst file: {zst_file}")
        return json_file
    except subprocess.CalledProcessError as e:
        print(f"Error decompressing {zst_file}: {e}")
        if "Window size larger than maximum" in str(e):
            print("Attempting decompression with increased memory...")
            try:
                subprocess.run(['zstd', '-d', zst_file, '-o', json_file, '--memory=2048MB'], check=True)
                print(f"Decompression complete: {json_file}")
                os.remove(zst_file)  # Delete zst file immediately after decompression
                print(f"Deleted zst file: {zst_file}")
                return json_file
            except subprocess.CalledProcessError as e2:
                print(f"Error decompressing {zst_file} with increased memory: {e2}")
                raise
        else:
            raise

def insert_batch(cursor, table_name, columns, batch_data):
    insert_query = sql.SQL("INSERT INTO {} ({}) VALUES {}").format(
        sql.Identifier(table_name),
        sql.SQL(', ').join(map(sql.Identifier, columns)),
        sql.SQL(', ').join([sql.Literal(tuple(row)) for row in batch_data])
    )
    cursor.execute(insert_query)

def insert_in_batches(cursor, conn, table_name, columns, data):
    batch_size = 100000
    for i in range(0, len(data), batch_size):
        batch_data = data[i:i+batch_size]
        insert_batch(cursor, table_name, columns, batch_data)
        conn.commit()  # Commit after each batch

def create_table_and_load_data(cursor, conn, json_file):
    table_name = os.path.splitext(os.path.basename(json_file))[0]
    
    print(f"Creating table and loading data for {table_name}...")
    
    # Count total lines in the file
    total_lines = sum(1 for _ in open(json_file, 'r', encoding='utf-8'))
    print(f"Total lines in file: {total_lines}")

    with open(json_file, 'r', encoding='utf-8') as file:
        sample_json = json.loads(file.readline())

    columns = list(sample_json.keys())
    column_definitions = [
        f'"{column}" NUMERIC' if column in ['score', 'created_utc', 'ups', 'downs'] else f'"{column}" VARCHAR'
        for column in columns
    ]
    column_definitions = ', '.join(column_definitions)

    create_table_query = sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(
        sql.Identifier(table_name), 
        sql.SQL(column_definitions)
    )
    cursor.execute(create_table_query)

    batch_size = 1000000
    batch_data = []
    total_inserted = 0

    with open(json_file, 'r', encoding='utf-8') as file:
        for line_number, line in enumerate(file, start=1):
            try:
                json_data = json.loads(line.replace('\0', ''))  # Remove NUL characters
                values = [str(json_data.get(column, '')) for column in columns]
                batch_data.append(values)

                if len(batch_data) >= batch_size:
                    insert_in_batches(cursor, conn, table_name, columns, batch_data)
                    total_inserted += len(batch_data)
                    print(f"Inserted {total_inserted}/{total_lines} rows ({(total_inserted/total_lines)*100:.2f}%)", end='\r')
                    batch_data = []

            except json.JSONDecodeError as e:
                print(f"\nError decoding JSON at line {line_number}: {e}")
                continue

        # Insert any remaining data
        if batch_data:
            insert_in_batches(cursor, conn, table_name, columns, batch_data)
            total_inserted += len(batch_data)

    print(f"\nCompleted inserting {total_inserted} rows for {table_name}")
    return table_name

def create_indexes(cursor, conn, table_name):
    print(f"Creating indexes for {table_name}...")
    index_columns = ['parent_id', 'link_id', 'score']
    total_indexes = len(index_columns)
    
    for i, column in enumerate(index_columns, 1):
        index_name = f'"{table_name}_{column}_index"'
        index_type = 'DESC' if column == 'score' else 'ASC'
        try:
            cursor.execute(f"CREATE INDEX {index_name} ON \"{table_name}\" (\"{column}\" {index_type});")
            print(f"Created index {i}/{total_indexes}: {index_name}", end='\r')
        except OperationalError as e:
            if "already exists" not in str(e):
                print(f"Error creating index {index_name}: {e}")
    
    conn.commit()  # Commit the index creation
    print(f"\nIndex creation complete for {table_name}")

def process_zst_file(zst_file, conn, cursor):
    start_time = time.time()
    try:
        json_file = decompress_zst(zst_file)
        table_name = create_table_and_load_data(cursor, conn, json_file)
        create_indexes(cursor, conn, table_name)
        os.remove(json_file)
        print(f"Deleted JSON file: {json_file}")
        end_time = time.time()
        processing_time = end_time - start_time
        return processing_time
    except Exception as e:
        conn.rollback()
        print(f"Error processing {zst_file}: {e}")
        if "No space left on device" in str(e):
            raise Exception("Storage space exhausted")
        return None

def main():
    conn = psycopg2.connect(
        dbname="Reddit-Rebuilt",
        user="Admin",
        password="Root",
        host="localhost"
    )
    cursor = conn.cursor()

    try:
        current_dir = os.getcwd()
        zst_files = [f for f in os.listdir(current_dir) if f.startswith("RC") and f.endswith(".zst")]
        
        with open('time.txt', 'a') as time_file:
            for i, zst_file in enumerate(zst_files, 1):
                print(f"Processing file {i}/{len(zst_files)}: {zst_file}")
                processing_time = process_zst_file(zst_file, conn, cursor)
                if processing_time is not None:
                    time_entry = f"{datetime.now()}: {zst_file} - Processing time: {processing_time:.2f} seconds\n"
                    time_file.write(time_entry)
                    print(time_entry.strip())
        
        print("Complete!")
    except Exception as e:
        print(f"Process stopped: {e}")
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    main()
