// Better Auth (email + password, cookie sessions). Mounted by index.js at /api/auth/*.
// It stores user/session/account/verification tables in the same database as the app.
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { pool } from './db.js';

export const auth = betterAuth({
  // Any node-postgres-style Pool (pg or Neon's) works. Non-Postgres: swap in that database's Better Auth adapter.
  database: pool,
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  // BETTER_AUTH_SECRET (32+ chars) is read from env by Better Auth itself.
  // Set BETTER_AUTH_URL to the public URL in production; locally the base URL is inferred from the request.
  // Add social providers / plugins here (see references/auth.md).
});

// Creates or extends the auth tables. Idempotent, so it runs on every start like migrate().
export async function migrateAuth() {
  const { runMigrations } = await getMigrations(auth.options);
  await runMigrations();
}
