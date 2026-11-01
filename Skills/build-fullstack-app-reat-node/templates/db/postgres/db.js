// Postgres access via node-postgres (any Postgres: local, Docker, RDS, Supabase, Azure, ...).
import pg from 'pg';
import { schema } from './schema.js';
import { seed } from './seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Postgres connection string.');
  process.exit(1);
}

// Set PGSSL=true for hosts that require TLS (most managed Postgres).
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

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
