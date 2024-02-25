import psycopg2
from psycopg2 import OperationalError

def drop_indexes(cursor):
    try:
        # Get a list of index names for tables starting with 'rc'
        cursor.execute("SELECT indexname FROM pg_indexes WHERE tablename LIKE 'rc%'")
        index_names = cursor.fetchall()

        # Drop each index
        for index_name in index_names:
            index_name = index_name[0]
            cursor.execute(f"DROP INDEX {index_name};")
            print(f"Index {index_name} dropped.")

        print("Indexes Dropped")

    except OperationalError as e:
        print(f"Error dropping indexes: {e}")

def create_index(cursor, table_name, column_name, index_name, index_type):
    try:
        cursor.execute(f"CREATE INDEX {index_name} ON \"{table_name}\" (\"{column_name}\" {index_type});")
        print(f"{index_type} index created for '{column_name}' column in table: {table_name}")
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

    # Drop existing indexes for tables starting with 'rc'
    drop_indexes(cursor)

    # Get a list of table names
    cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    table_names = cursor.fetchall()

    # Iterate through tables and create indexes
    for table_name in table_names:
        table_name = table_name[0]
        if table_name.startswith('rc'):  # Adjust as per your naming convention
            create_index(cursor, table_name, 'parent_id', f'"{table_name}_parent_id_index"', 'ASC')
            create_index(cursor, table_name, 'link_id', f'"{table_name}_link_id_index"', 'DESC')
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
