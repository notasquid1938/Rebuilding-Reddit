import psycopg2
from psycopg2 import sql
import plotly.graph_objects as go

# Function to visualize column data
def visualize_column_data(table_name, column_names, cursor):
    for column_name in column_names:
        query = sql.SQL("""
            SELECT {column_name}, COUNT(*)
            FROM {table_name}
            GROUP BY {column_name}
            ORDER BY COUNT(*) DESC
            LIMIT 100
        """).format(
            column_name=sql.Identifier(column_name),
            table_name=sql.Identifier(table_name)
        )

        cursor.execute(query)
        data = cursor.fetchall()

        # Extract values and counts
        values = [row[0] for row in data]
        counts = [row[1] for row in data]

        # Calculate percentage
        total_count = sum(counts)
        percentages = [(count / total_count) * 100 for count in counts]

        # Create Plotly figure
        fig = go.Figure()

        # Add horizontal bar chart
        fig.add_trace(go.Bar(
            y=values[::-1],  # Reverse the order to have the highest count at the top
            x=counts[::-1],  # Reverse the order to match the values
            text=[f'{count} ({percent:.2f}%)' for count, percent in zip(counts[::-1], percentages[::-1])],  # Reverse the order to match values
            orientation='h'
        ))

        # Update layout
        fig.update_layout(
            title=f'Distribution of {column_name}',
            xaxis_title='Count',
            yaxis_title=column_name,
            bargap=0.15,
            template='plotly_white'
        )

        # Show plot
        fig.show()

# Connection parameters
connection_params = {
    "user": "Admin",
    "password": "Root",
    "host": "localhost",
    "port": "5432",
    "database": "Reddit-Rebuilt"
}

try:
    # Connect to the PostgreSQL database
    connection = psycopg2.connect(**connection_params)
    cursor = connection.cursor()

    # Define the table and columns to visualize
    table_name = 'rs_2011_01'
    columns_to_visualize = ['subreddit']

    # Visualize the column data
    visualize_column_data(table_name, columns_to_visualize, cursor)

    # Close the cursor and connection
    cursor.close()
    connection.close()

except (Exception, psycopg2.Error) as error:
    print("Error while connecting to PostgreSQL:", error)
