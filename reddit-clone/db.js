import { Pool } from 'pg';

const postgresURL = process.env.POSTGRES_URL || 'postgres://postgres:postgres@localhost:5432/Reddit-Rebuilt';

let cachedPool = null;

async function connectToDatabase() {
  if (cachedPool) {
    return cachedPool;
  }

  const pool = new Pool({
    connectionString: postgresURL,
    max: 20, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
  });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    cachedPool = null; // Reset cache on error
  });

  cachedPool = pool;

  return pool;
}

// Graceful shutdown
process.on('SIGINT', async () => {
  if (cachedPool) {
    await cachedPool.end();
    console.log('Database pool closed');
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  if (cachedPool) {
    await cachedPool.end();
    console.log('Database pool closed');
    process.exit(0);
  }
});

export default connectToDatabase;