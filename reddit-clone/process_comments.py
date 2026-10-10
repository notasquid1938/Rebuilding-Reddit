import os
import json
import psycopg2
from psycopg2 import sql, OperationalError
import subprocess
import time
from datetime import datetime
import traceback

# --- Configuration ---
PROCESSED_LOG_FILE = "processed_comments.log"

def get_db_connection():
    return psycopg2.connect(
        dbname=os.getenv("POSTGRES_DB", "Reddit-Rebuilt"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        host=os.getenv("POSTGRES_HOST", "localhost")
    )

def is_processed(filename):
    if not os.path.exists(PROCESSED_LOG_FILE):
        return False
    with open(PROCESSED_LOG_FILE, 'r') as f:
        return filename in f.read()

def log_processed(filename):
    with open(PROCESSED_LOG_FILE, 'a') as f:
        f.write(f"{filename}\n")

def decompress_zst(zst_file):
    base_name = os.path.splitext(zst_file)[0].lower()
    json_file = f"{base_name.replace('-', '_')}.json"
    print(f"Decompressing {zst_file}...")
    
    try:
        subprocess.run(['zstd', '-d', zst_file, '-o', json_file, '--long=31'], check=True)
        return json_file
    except subprocess.CalledProcessError:
        print("Standard decompression failed. Retrying with high memory...")
        try:
            subprocess.run(['zstd', '-d', zst_file, '-o', json_file, '--memory=2048MB'], check=True)
            return json_file
        except subprocess.CalledProcessError as e:
            print(f"Fatal error decompressing {zst_file}: {e}")
            raise

def insert_in_batches(cursor, conn, table_name, columns, data):
    insert_query = sql.SQL("INSERT INTO {} ({}) VALUES {}").format(
        sql.Identifier(table_name),
        sql.SQL(', ').join(map(sql.Identifier, columns)),
        sql.SQL(', ').join([sql.Literal(tuple(row)) for row in data])
    )
    cursor.execute(insert_query)
    conn.commit()

def create_table_and_load_data(cursor, conn, json_file):
    table_name = os.path.splitext(os.path.basename(json_file))[0]
    print(f"Loading data for {table_name}...")

    # Union of keys over a sample: the first line alone can miss columns
    columns = ['id', 'parent_id', 'link_id', 'author', 'body', 'score', 'created_utc']
    seen = set(columns)
    with open(json_file, 'r', encoding='utf-8') as file:
        for i, line in enumerate(file):
            if i >= 50000:
                break
            try:
                keys = json.loads(line.replace('\0', '')).keys()
            except json.JSONDecodeError:
                continue
            for key in keys:
                if key not in seen:
                    seen.add(key)
                    columns.append(key)
    
    col_defs = []
    for col in columns:
        dtype = 'NUMERIC' if col in ['score', 'created_utc', 'ups', 'downs'] else 'VARCHAR'
        col_defs.append(f'"{col}" {dtype}')
    
    cursor.execute(sql.SQL("CREATE TABLE IF NOT EXISTS {} ({})").format(
        sql.Identifier(table_name), 
        sql.SQL(', '.join(col_defs))
    ))
    conn.commit()

    batch_data = []
    batch_size = 100000
    
    with open(json_file, 'r', encoding='utf-8') as file:
        for line in file:
            try:
                json_data = json.loads(line.replace('\0', ''))
                row = []
                for col in columns:
                    val = json_data.get(col)
                    if col in ['score', 'created_utc', 'ups', 'downs']:
                        try:
                            row.append(float(val) if val is not None else None)
                        except (ValueError, TypeError):
                            row.append(None)
                    else:
                        row.append(str(val) if val is not None else '')
                batch_data.append(row)

                if len(batch_data) >= batch_size:
                    insert_in_batches(cursor, conn, table_name, columns, batch_data)
                    batch_data = []
            except json.JSONDecodeError:
                continue
                
        if batch_data:
            insert_in_batches(cursor, conn, table_name, columns, batch_data)

    print(f"Finished loading {table_name}")
    return table_name

def create_indexes(cursor, conn, table_name):
    print(f"Indexing {table_name}...")
    for col, order in [('parent_id', 'ASC'), ('link_id', 'ASC'), ('score', 'DESC')]:
        idx_name = f"{table_name}_{col}_index"
        try:
            cursor.execute(sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} ({})").format(
                sql.Identifier(idx_name), sql.Identifier(table_name), sql.SQL(f'"{col}" {order}')
            ))
        except OperationalError:
            pass
    conn.commit()

def process_file(zst_file):
    conn = get_db_connection()
    cursor = conn.cursor()
    json_file = None
    
    try:
        json_file = decompress_zst(zst_file)
        table_name = create_table_and_load_data(cursor, conn, json_file)
        create_indexes(cursor, conn, table_name)
        
        # Log success
        log_processed(zst_file)
        
        # CLEANUP: Delete JSON
        if os.path.exists(json_file):
            os.remove(json_file)
            
        # CLEANUP: Delete ZST (Space Saving)
        if os.path.exists(zst_file):
            print(f"Deleting processed file: {zst_file}")
            os.remove(zst_file)

    except Exception as e:
        print(f"Error processing {zst_file}: {e}")
        conn.rollback()
    finally:
        cursor.close()
        conn.close()

def main():
    print("Starting Comments Processor...")
    # Find all RC_*.zst files
    files = sorted([f for f in os.listdir('.') if f.startswith('RC') and f.endswith('.zst')])
    
    for f in files:
        if is_processed(f):
            print(f"Skipping {f} (already processed)")
            # Safety cleanup if ZST still exists for a processed file
            if os.path.exists(f): os.remove(f)
            continue
        process_file(f)

if __name__ == "__main__":
    main()