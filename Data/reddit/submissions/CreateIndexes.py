##MUST BE RUN IN SUBMISSIONS DIRECTORY

import os
import psycopg2
from psycopg2 import OperationalError

def drop_indexes(cursor, table_name):
    try:
        cursor.execute(f"DROP INDEX IF EXISTS \"{table_name}_score_index\";")
        cursor.execute(f"DROP INDEX IF EXISTS \"{table_name}_id_index\";")
        cursor.execute(f"DROP INDEX IF EXISTS \"{table_name}_subreddit_index\";")
        print(f"Indexes dropped for table: {table_name}")
    except OperationalError as e:
        print(f"Error dropping indexes for table {table_name}: {e}")

def create_index(cursor, table_name, column_name, index_name, index_type):
    try:
        cursor.execute(f"CREATE INDEX {index_name} ON \"{table_name}\" (\"{column_name}\" {index_type});")
        print(f"{index_type} index created for '{column_name}' column in table: {table_name}")
    except OperationalError as e:
        if "already exists" in str(e):
            print(f"{index_type} index for '{column_name}' column already exists in table: {table_name}")
        else:
            print(f"Error creating index for '{column_name}' column in table {table_name}: {e}")

try:
    # Connect to the database and create cursor
    connection = psycopg2.connect(
        user="Admin",
        password="Root",
        host="localhost",
        port="5432",
        database="Reddit-Rebuilt"
    )
    cursor = connection.cursor()

    # Get a list of text file names in the directory
    txt_files = [filename for filename in os.listdir('.') if filename.endswith('.txt')]

    # Extract table names from file names and create indexes accordingly
    for txt_file in txt_files:
        table_name = txt_file.split('.')[0]  # Extract table name from file name
        drop_indexes(cursor, table_name)
        create_index(cursor, table_name, 'score', f'"{table_name}_score_index"', 'DESC')
        create_index(cursor, table_name, 'id', f'"{table_name}_id_index"', 'ASC')
        create_index(cursor, table_name, 'subreddit', f'"{table_name}_subreddit_index"', 'ASC')

        # Commit and print after each table's indexes are done
        connection.commit()
        print("Indexes Committed for table:", table_name)

except OperationalError as e:
    print(f"Error connecting to PostgreSQL: {e}")

finally:
    # Close PostgreSQL connection
    if connection:
        cursor.close()
        connection.close()
