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

# Function to create table partitions
def create_table_partition(table_name, partition_name, partition_value):
    create_partition_query = sql.SQL("CREATE TABLE {} PARTITION OF {} FOR VALUES FROM (%s) TO (%s)").format(
        sql.Identifier(partition_name),
        sql.Identifier(table_name)
    )
    cursor.execute(create_partition_query, [partition_value, partition_value])

# Get a list of existing tables
cursor.execute(
    sql.SQL("SELECT table_name FROM information_schema.tables WHERE table_name LIKE 'rs%'")
)
tables = cursor.fetchall()

# Loop through the tables and create partitions
for table in tables:
    table_name = table[0]
    partition_name_prefix = f"{table_name}_partition_"

    # Get distinct subreddit values
    cursor.execute(
        sql.SQL("SELECT DISTINCT subreddit FROM {}").format(sql.Identifier(table_name))
    )
    subreddits = cursor.fetchall()

    # Loop through subreddits and create partitions
    for subreddit in subreddits:
        subreddit_name = subreddit[0]
        partition_name = f"{partition_name_prefix}{subreddit_name}"
        partition_value = subreddit_name

        # Check if the partition already exists
        cursor.execute(
            sql.SQL("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = %s)"),
            [partition_name]
        )
        partition_exists = cursor.fetchone()[0]

        if partition_exists:
            print(f"Partition '{partition_name}' already exists for table '{table_name}'. Skipping...")
            continue

        # Create table partition
        create_table_partition(table_name, partition_name, partition_value)

        print(f"Created partition '{partition_name}' for table '{table_name}'.")

# Close the connection
cursor.close()
conn.close()
