import os
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

# Function to get unique subreddit names and their corresponding tables
def get_unique_subreddits_and_tables(existing_tables):
    subreddits = {}
    for table_name in existing_tables:
        if table_name.startswith('rs'):
            cursor.execute(sql.SQL("SELECT DISTINCT subreddit FROM {}").format(sql.Identifier(table_name)))
            subreddits_in_table = [row[0] for row in cursor.fetchall()]
            table_date = table_name[3:]  # Remove 'rs_' prefix
            for subreddit in subreddits_in_table:
                if subreddit not in subreddits:
                    subreddits[subreddit] = [table_date]
                else:
                    subreddits[subreddit].append(table_date)
    return subreddits

# Function to create a new table for unique subreddit names and their dates
def create_subreddits_table(subreddits):
    if subreddits:
        create_table_query = """
        CREATE TABLE IF NOT EXISTS subreddits (
            subreddit VARCHAR PRIMARY KEY,
            found_in_tables TEXT[]
        )
        """
        cursor.execute(create_table_query)
        for subreddit, tables in subreddits.items():
            insert_query = """
            INSERT INTO subreddits (subreddit, found_in_tables)
            VALUES (%s, %s)
            ON CONFLICT (subreddit) DO UPDATE
            SET found_in_tables = array(SELECT DISTINCT unnest(subreddits.found_in_tables || EXCLUDED.found_in_tables));
            """
            cursor.execute(insert_query, (subreddit, tables))

# Get a list of existing tables
cursor.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
existing_tables = [row[0] for row in cursor.fetchall()]

# Get unique subreddits and the tables they're found in
subreddits = get_unique_subreddits_and_tables(existing_tables)

# Create the subreddits table
create_subreddits_table(subreddits)

# Close the connection
cursor.close()
conn.close()
