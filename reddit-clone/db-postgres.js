import { Pool } from 'pg';

const postgresURL = 'postgres://username:password@localhost:5432/Rebuild-Reddit';

let cachedPool = null;

async function connectToDatabase() {
  if (cachedPool) {
    return cachedPool;
  }

  const pool = new Pool({
    connectionString: postgresURL
  });

  cachedPool = pool;

  return pool;
}

export default connectToDatabase;
