// Postgres access via Neon's serverless driver. Pool speaks the node-postgres
// API over WebSockets and supports interactive transactions.
import { Pool } from '@neondatabase/serverless';
import { schema } from './schema.js';
import { seed } from './seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
  process.exit(1);
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Creates tables if missing, then lets seed.js fill an empty database.
export async function migrate() {
  await pool.query(schema);
  await seed(pool, withTransaction);
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
