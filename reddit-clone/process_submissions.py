import os
import json
import psycopg2
from psycopg2 import sql, OperationalError, DatabaseError
from psycopg2.extras import execute_values
import subprocess
from datetime import datetime, timedelta
import traceback
import sys
import time

# --- Configuration ---
PROCESSED_LOG_FILE = "processed_submissions.log"
CONSOLIDATION_LOG_FILE = "consolidated_tables.log"
# Copying every monthly table into one partitioned table doubles the database
# size and nothing in the website reads it, so it is opt-in.
CONSOLIDATE = os.getenv("CONSOLIDATE", "0") == "1"

# Columns the website relies on; created even if absent from the sampled lines
REQUIRED_COLUMNS = ['id', 'author', 'subreddit', 'title', 'selftext', 'url', 'domain', 'score',
                    'created_utc', 'num_comments', 'is_self', 'over_18', 'permalink']
HEADER_SAMPLE_LINES = 50000

def get_db_connection():
    return psycopg2.connect(
        dbname=os.getenv("POSTGRES_DB", "Reddit-Rebuilt"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", "postgres"),
        host=os.getenv("POSTGRES_HOST", "localhost")
    )

def is_log_entry_present(logfile, entry):
    if not os.path.exists(logfile): return False
    with open(logfile, 'r') as f: return entry in f.read()

def append_log_entry(logfile, entry):
    with open(logfile, 'a') as f: f.write(f"{entry}\n")

# ==========================================
# PART 1: IMPORT RAW ZST DATA
# ==========================================

def decompress_zst(zst_file):
    base_name = os.path.splitext(zst_file)[0].lower()
    json_file = f"{base_name.replace('-', '_')}.json"
    print(f"Decompressing {zst_file}...")
    subprocess.run(['zstd', '-d', zst_file, '-o', json_file, '--long=31'], check=True)
    return json_file

def sample_headers(json_file):
    # The first line alone isn't representative (in RS_2017-09 it was an ad
    # with no "subreddit"), so take the union of keys over a sample.
    headers = list(REQUIRED_COLUMNS)
    seen = set(headers)
    with open(json_file, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            if i >= HEADER_SAMPLE_LINES:
                break
            try:
                keys = json.loads(line.replace('\0', '')).keys()
            except json.JSONDecodeError:
                continue
            for key in keys:
                if key not in seen:
                    seen.add(key)
                    headers.append(key)
    return headers

def to_db_value(value):
    # Nested objects (media, preview, ...) can't be adapted by psycopg2; store them as JSON text
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value

def load_rs_table(cursor, conn, json_file):
    table_name = os.path.splitext(os.path.basename(json_file))[0]
    print(f"Loading {table_name}...")

    headers = sample_headers(json_file)

    # Use TEXT for flexibility during import, cast later if needed
    col_defs = [f'"{c}" NUMERIC' if c in ['score', 'created_utc'] else f'"{c}" TEXT' for c in headers]

    # This file isn't in the processed log, so any existing table is a partial
    # earlier attempt; start clean rather than appending duplicates.
    cursor.execute(sql.SQL("DROP TABLE IF EXISTS {}").format(sql.Identifier(table_name)))
    # OPTIMIZATION: Create UNLOGGED table to reduce disk I/O and WAL growth
    cursor.execute(sql.SQL("CREATE UNLOGGED TABLE {} ({})").format(
        sql.Identifier(table_name), sql.SQL(', '.join(col_defs))
    ))
    conn.commit()

    batch, batch_size = [], 10000
    row_count = 0
    
    insert_query = sql.SQL("INSERT INTO {} ({}) VALUES %s").format(
        sql.Identifier(table_name),
        sql.SQL(', ').join(map(sql.Identifier, headers))
    )

    with open(json_file, 'r', encoding='utf-8') as f:
        for line in f:
            try:
                # Remove null bytes which postgres hates
                line_clean = line.replace('\0', '')
                data = json.loads(line_clean)
                row = [to_db_value(data.get(c, None)) for c in headers]
                batch.append(row)
                
                if len(batch) >= batch_size:
                    try:
                        execute_values(cursor, insert_query, batch)
                        conn.commit()
                        row_count += len(batch)
                        if row_count % 100000 == 0:
                            print(f"  Imported {row_count} rows...")
                    except (OperationalError, DatabaseError) as e:
                        conn.rollback()
                        print(f"  Batch failed in {table_name}: {e}")
                        # We suppress the stack trace to prevent log explosion
                    
                    batch = []
            except json.JSONDecodeError:
                continue
            except Exception as e:
                # General safety catch
                continue
        
        # Insert remaining
        if batch:
            try:
                execute_values(cursor, insert_query, batch)
                conn.commit()
            except Exception as e:
                conn.rollback()
                print(f"  Final batch failed in {table_name}: {e}")
    
    print(f"Indexing {table_name}...")
    # Indexes used by the website: subreddit feeds, thread lookup, user pages, global Top
    indexes = [
        ("sub_score_idx", "(subreddit, score DESC)"),
        ("sub_author_idx", "(subreddit, author)"),
        ("id_idx", "(id)"),
        ("author_created_idx", "(author, created_utc DESC)"),
        ("score_idx", "(score DESC)"),
    ]
    for suffix, columns in indexes:
        try:
            cursor.execute(sql.SQL("CREATE INDEX IF NOT EXISTS {} ON {} " + columns).format(
                sql.Identifier(f"{table_name}_{suffix}"), sql.Identifier(table_name)))
            conn.commit()
        except Exception as e:
            print(f"Index creation failed ({suffix}): {e}")
            conn.rollback()
    cursor.execute(sql.SQL("ANALYZE {}").format(sql.Identifier(table_name)))
    conn.commit()

# ==========================================
# PART 2: CONSOLIDATE TO MASTER TABLE
# ==========================================

def consolidate_tables(conn):
    cursor = conn.cursor()
    print("Starting consolidation...")
    
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'rs_%'")
    tables = sorted([r[0] for r in cursor.fetchall()])
    
    # We only create the master table if we have tables to process
    if not tables: return

    # Determine master columns based on the first table found (simplified for stability)
    cursor.execute(sql.SQL("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = %s"), [tables[0]])
    master_cols_def = cursor.fetchall()
    
    if not master_cols_def:
        print("Error: Could not determine columns.")
        return

    # Create Partitioned Master Table
    col_defs = [f'"{c}" {t}' for c, t in master_cols_def]
    
    # Ensure ID and Submission_Date exist for the primary key
    if not any('id' in c for c,t in master_cols_def):
        print("Error: 'id' column missing.")
        return

    cursor.execute(sql.SQL("""
        CREATE TABLE IF NOT EXISTS submissions (
            {}, 
            submission_date DATE DEFAULT CURRENT_DATE, 
            PRIMARY KEY (id, submission_date)
        ) PARTITION BY RANGE (submission_date)
    """).format(sql.SQL(', ').join(map(sql.SQL, col_defs))))
    conn.commit()

    for table in tables:
        if is_log_entry_present(CONSOLIDATION_LOG_FILE, table):
            continue

        print(f"Consolidating {table}...")
        
        try:
            # Parse date from table name rs_YYYY_MM
            date_part = table[3:]
            dt = datetime.strptime(date_part, "%Y_%m").date()
            
            # Calculate start/end for partition
            start = dt.strftime("%Y-%m-01")
            # Logic to get next month 1st day
            next_month = dt.replace(day=28) + timedelta(days=4)
            end = next_month.replace(day=1).strftime("%Y-%m-%d")
            
            part_name = f"submissions_{date_part}"
            
            # Create the partition
            cursor.execute(sql.SQL("CREATE TABLE IF NOT EXISTS {} PARTITION OF submissions FOR VALUES FROM (%s) TO (%s)").format(
                sql.Identifier(part_name)), [start, end])
            conn.commit()
            
            # Identify common columns
            cursor.execute(sql.SQL("SELECT column_name FROM information_schema.columns WHERE table_name = %s"), [table])
            local_cols = [r[0] for r in cursor.fetchall()]
            
            # Intersection of columns
            valid_cols = [c for c, t in master_cols_def if c in local_cols]
            cols_sql = sql.SQL(', ').join(map(sql.Identifier, valid_cols))
            
            # Insert data - using UNLOGGED source tables is fast
            # We assume created_utc exists to calculate date
            cursor.execute(sql.SQL("""
                INSERT INTO submissions ({cols}, submission_date)
                SELECT {cols}, TO_TIMESTAMP(created_utc)::date FROM {src}
                ON CONFLICT (id, submission_date) DO NOTHING
            """).format(cols=cols_sql, src=sql.Identifier(table)))
            
            conn.commit()
            append_log_entry(CONSOLIDATION_LOG_FILE, table)
            
            # OPTIONAL: Drop the raw table to save space immediately
            # cursor.execute(sql.SQL("DROP TABLE {}").format(sql.Identifier(table)))
            # conn.commit()
            
        except Exception as e:
            print(f"Error consolidating {table}: {e}")
            conn.rollback()

# ==========================================
# PART 3: UPDATE SUBREDDIT MAP
# ==========================================

def update_subreddit_map(conn):
    print("Updating Subreddit Map...")
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS subreddit_table_map (
            subreddit TEXT NOT NULL,
            table_date DATE NOT NULL,
            PRIMARY KEY (subreddit, table_date)
        );
        CREATE INDEX IF NOT EXISTS idx_map_date ON subreddit_table_map (table_date);
    """)
    conn.commit()
    
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'rs_%'")
    tables = [r[0] for r in cursor.fetchall()]
    
    for table in tables:
        try:
            date_str = table[3:]
            dt = datetime.strptime(date_str, "%Y_%m").date()
            
            cursor.execute(sql.SQL("SELECT DISTINCT subreddit FROM {}").format(sql.Identifier(table)))
            subs = cursor.fetchall()
            
            args = [(s[0], dt) for s in subs if s[0]]
            if args:
                execute_values(cursor, 
                    "INSERT INTO subreddit_table_map (subreddit, table_date) VALUES %s ON CONFLICT DO NOTHING", 
                    args)
                conn.commit()
        except Exception as e:
            print(f"Error mapping {table}: {e}")

# ==========================================
# MAIN EXECUTION
# ==========================================

def main():
    # Wait for DB to be ready
    conn = None
    while conn is None:
        try:
            conn = get_db_connection()
        except OperationalError:
            print("Waiting for database...")
            time.sleep(5)

    cursor = conn.cursor()

    files = sorted([f for f in os.listdir('.') if f.startswith('RS') and f.endswith('.zst')])
    for f in files:
        if is_log_entry_present(PROCESSED_LOG_FILE, f):
            print(f"Skipping {f} (processed)")
            continue
        
        json_file = None
        try:
            json_file = decompress_zst(f)
            load_rs_table(cursor, conn, json_file)
            append_log_entry(PROCESSED_LOG_FILE, f)
        except Exception as e:
            print(f"Fatal error importing {f}: {e}")
            conn.rollback()
        finally:
            if json_file and os.path.exists(json_file): 
                os.remove(json_file)

    # Optional consolidation and mapping (the website uses neither; see
    # scripts/build_subreddit_metadata.sql, run by entrypoint-loader.sh)
    if CONSOLIDATE:
        try:
            consolidate_tables(conn)
            update_subreddit_map(conn)
        except Exception as e:
            print(f"Post-processing error: {e}")

    print("Submissions processing complete.")
    conn.close()

if __name__ == "__main__":
    main()