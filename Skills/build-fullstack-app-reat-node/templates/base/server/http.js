// Shared HTTP helpers for route modules.
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 doesn't forward rejected promises to the error handler on its own.
export const route = (fn) => (req, res, next) => fn(req, res).catch(next);

// Resolves the Better Auth session cookie to req.user (or null). Never rejects the request by itself.
export async function attachUser(req, res, next) {
  try {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    req.user = session?.user ?? null;
    next();
  } catch (err) {
    next(err);
  }
}

// Use as route middleware for endpoints that need a signed-in user.
export function requireUser(req, res, next) {
  next(req.user ? undefined : new HttpError(401, 'Please sign in'));
}

// The signed-in user's id: the single seam every owner-scoped read AND write goes through.
// Throws 401 when signed out. Answer 404 (not 403) for other people's records.
export function customerId(req) {
  if (!req.user) throw new HttpError(401, 'Please sign in');
  return req.user.id;
}
