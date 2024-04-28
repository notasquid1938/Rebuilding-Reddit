import os
import psycopg2
from psycopg2 import OperationalError

def drop_indexes(cursor, table_name):
    try:
        cursor.execute(f"DROP INDEX IF EXISTS \"{table_name}_parent_id_index\";")
        cursor.execute(f"DROP INDEX IF EXISTS \"{table_name}_link_id_index\";")
        cursor.execute(f"DROP INDEX IF EXISTS \"{table_name}_score_index\";")
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

    # Get the current working directory
    current_directory = os.getcwd()

    # Get a list of table names from the names of .txt files in the directory
    txt_files = [file for file in os.listdir(current_directory) if file.endswith(".txt")]
    table_names = [file.split(".")[0] for file in txt_files]

    # Iterate through table names
    for table_name in table_names:
        drop_indexes(cursor, table_name)  # Drop indexes for the current table
        create_index(cursor, table_name, 'parent_id', f'"{table_name}_parent_id_index"', 'ASC')
        create_index(cursor, table_name, 'link_id', f'"{table_name}_link_id_index"', 'DESC')
        create_index(cursor, table_name, 'score', f'"{table_name}_score_index"', 'DESC')
        # Commit the transaction after each table is processed
        connection.commit()
        print(f"Indexes Committed for table: {table_name}")

except OperationalError as e:
    print(f"Error connecting to PostgreSQL: {e}")

finally:
    # Close PostgreSQL connection
    if connection:
        cursor.close()
        connection.close()
