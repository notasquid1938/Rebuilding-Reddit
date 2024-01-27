import os
import json
import psycopg2
from psycopg2 import sql

# Connect to PostgreSQL
conn = psycopg2.connect(
    dbname="Reddit-Rebuilt",
    user="Admin",
    password="Root",
    host="localhost"
)
conn.autocommit = True
cursor = conn.cursor()

# Get the current directory
current_dir = os.path.dirname(os.path.abspath(__file__))

# Loop through each JSON file in the current directory
for filename in os.listdir(current_dir):
    if filename.endswith('.json'):
        table_name = os.path.splitext(filename)[0]

        # Check if the table already exists
        cursor.execute(
            sql.SQL("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)"),
            [table_name]
        )
        table_exists = cursor.fetchone()[0]

        if table_exists:
            print(f"Table '{table_name}' already exists. Skipping...")
            continue

        # Read JSON file and create table columns
        with open(os.path.join(current_dir, filename), 'r', encoding='utf-8') as file:
            sample_json = json.loads(file.readline())

        columns = sample_json.keys()
        column_definitions = ', '.join([f'"{column}" VARCHAR' for column in columns])

        # Create table
        create_table_query = sql.SQL("CREATE TABLE {} ({})").format(sql.Identifier(table_name), sql.SQL(column_definitions))
        cursor.execute(create_table_query)

        # Read JSON file and insert data into PostgreSQL
        with open(os.path.join(current_dir, filename), 'r', encoding='utf-8') as file:
            for line_number, line in enumerate(file, start=1):
                try:
                    json_data = json.loads(line)
                    
                    # Prepare values as strings for insertion
                    values = [str(json_data.get(column, '')) for column in columns]
                    
                    # Construct and execute the insert query
                    insert_query = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
                        sql.Identifier(table_name),
                        sql.SQL(', ').join(map(sql.Identifier, columns)),
                        sql.SQL(', ').join([sql.Literal(value) for value in values])
                    )
                    cursor.execute(insert_query)
                except json.JSONDecodeError as e:
                    print(f"Error decoding JSON in file '{filename}' at line {line_number}: {e}.")
                    print(f"Problematic JSON content: {line}")
                    continue



        print(f"Finished processing table: {table_name}")

# Close the connection
cursor.close()
conn.close()
