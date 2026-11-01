import express, { Router } from 'express';
import { pool } from './db.js';
import { HttpError, route, customerId, attachUser, requireUser } from './http.js'; // eslint-disable-line no-unused-vars

export const api = Router();
api.use(express.json());
api.use(attachUser); // sets req.user from the session cookie (null when signed out)

// Postgres numeric columns arrive as strings; add toX mappers that Number() them.

api.get('/health', route(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ ok: true });
}));

// Catalog-style reads stay public. Owner-scoped routes call customerId(req) (401 when signed out) or use requireUser.
// TODO(domain): routes go here. Validate input, throw HttpError(400/404/409, msg),
// compute prices/totals/availability server-side, use withTransaction + FOR UPDATE for contended writes.

api.use((req, res) => res.status(404).json({ error: 'Not found' }));

// eslint-disable-next-line no-unused-vars
api.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Internal server error' });
});
