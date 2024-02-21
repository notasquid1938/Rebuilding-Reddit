import { Pool } from 'pg';

const postgresURL = 'postgres://Admin:Root@localhost:5432/Reddit-Rebuilt';

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
