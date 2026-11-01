// TODO(db): the user chose a non-Postgres database. Implement this module against their driver, keeping the
// SAME exports so api.js/seed.js stay unchanged: `pool.query(sql, params) -> { rows }`, `withTransaction(fn)`
// (fn receives an object with the same `query`), and `migrate()`. See references/databases.md for the
// SQL differences to port (row locks, partial unique indexes, exclusion constraints, numeric handling).
// Also TODO(db): server/auth.js passes `pool` to Better Auth, which only understands real drivers. Replace
// `database: pool` there with the right Better Auth setup for this database (see references/auth.md).
import { schema } from './schema.js';
import { seed } from './seed.js';

export const pool = {
  async query() {
    throw new Error('db.js is not implemented for the chosen database yet');
  },
};

export async function migrate() {
  await pool.query(schema);
  await seed(pool, withTransaction);
}

export async function withTransaction(fn) {
  return fn(pool);
}
