import psycopg2
from psycopg2 import OperationalError

def index_exists(cursor, index_name):
    """
    Check if an index with the given name already exists.
    """
    cursor.execute("SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = %s)", (index_name,))
    return cursor.fetchone()[0]

def create_index(cursor, table_name, column_name, index_name, index_type):
    try:
        if not index_exists(cursor, index_name):
            cursor.execute(f"CREATE INDEX {index_name} ON \"{table_name}\" (\"{column_name}\" {index_type});")
            print(f"{index_type} index created for '{column_name}' column in table: {table_name}")
        else:
            print(f"{index_type} index for '{column_name}' column already exists in table: {table_name}")
    except OperationalError as e:
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

    # Get a list of table names
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    table_names = cursor.fetchall()

    # Iterate through tables and create indexes
    for table_name in table_names:
        table_name = table_name[0]
        if table_name.startswith('rc'):  # Adjust as per your naming convention
            #create_index(cursor, table_name, 'parent_id', f'"{table_name}_parent_id_index"', 'ASC')
            #create_index(cursor, table_name, 'link_id', f'"{table_name}_link_id_index"', 'DESC')
            create_index(cursor, table_name, 'score', f'"{table_name}_score_index"', 'DESC')

    # Commit the transaction after all indexes are created
    connection.commit()
    print("Indexes Committed")

except OperationalError as e:
    print(f"Error connecting to PostgreSQL: {e}")

finally:
    # Close PostgreSQL connection
    if connection:
        cursor.close()
        connection.close()
