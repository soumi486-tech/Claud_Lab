# Authentication: Better Auth (included in every scaffold)

Verified against `better-auth@1.7.13` (Express 4, ESM). Docs: https://www.better-auth.com/docs/integrations/express

## What the template wires up
| Piece | File | Notes |
|---|---|---|
| Config + migration | `server/auth.js` | `betterAuth({ database: pool, emailAndPassword })`; `migrateAuth()` uses `getMigrations` from `better-auth/db/migration` and runs on every start (idempotent) |
| Mount | `server/index.js` | `app.all('/api/auth/*', toNodeHandler(auth))` BEFORE `app.use('/api', api)` (api.js has `express.json()`; body parsers before the handler hang the auth requests) |
| Session -> `req.user` | `server/http.js` `attachUser` | `auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`; signed out = `null` |
| Owner id | `customerId(req)` | returns `req.user.id`, throws 401 when signed out. Same seam as before, so the patterns' owner scoping works unchanged |
| Guard | `requireUser` | route middleware for endpoints needing a user |
| Client | `src/lib/auth.js` | `createAuthClient()` from `better-auth/react`; exports `useSession, signIn, signUp, signOut` |
| UI | `Login.jsx` (`/login`, `/signup`), `Account.jsx`, `RequireAuth.jsx`, `Header.jsx` | `?next=` return path is checked to be a same-site path |

Auth tables created by Better Auth in the app database: `user`, `session`, `account`, `verification`.
Domain tables keep `customer_id text` holding the user id with NO foreign key, so schema order doesn't matter and
the auth tables stay Better Auth's own business.

## Environment
- `BETTER_AUTH_SECRET`: 32+ chars. `scaffold.mjs` generates it into `<app>/.env` (never printed). Hosts must set it as a secret.
- `BETTER_AUTH_URL`: public URL. Optional locally (inferred from the request, so any dev port works), required in production.
- `app.set('trust proxy', 1)` is set in `index.js` because hosts terminate TLS.

## Public vs protected
Browsing (catalog, search, availability) stays public; anything creating or reading someone's records is
owner-scoped through `customerId(req)`. Frontend: wrap those pages in `<RequireAuth>`; the client's `request()`
rejects with `error.status === 401` if a session expires mid-use. Other customers' records: 404, not 403.

## Extending
Social login, email verification, 2FA, roles etc. are Better Auth config/plugins in `server/auth.js`. Plugins add
tables: `migrateAuth()` creates them on the next start. Email verification/password reset need an email sender;
there is none by default, so don't enable `requireEmailVerification` without wiring one. Say in the UI what is
not available (e.g. no password reset yet).

## Other databases (`--db other`)
`database: pool` only works for node-postgres-style pools (anything with `connect`, which Better Auth wraps in
Kysely's Postgres dialect; this covers `pg` and Neon). For MySQL (`mysql2` pool), SQLite (`better-sqlite3`
instance) pass that object instead; MongoDB/Prisma/Drizzle use `better-auth/adapters/*`. `getMigrations` then
covers Kysely-based databases only; for adapters that aren't, run `npx auth@latest generate` and apply the output.

## Verification recipe (step 4 of SKILL.md)
```bash
# sign up two throwaway users, each with its own cookie jar (Origin header is required by the CSRF check)
curl -c a.jar -H "Origin: http://localhost:PORT" -H "Content-Type: application/json" \
  -d '{"name":"A","email":"a1@example.test","password":"test-pass-123"}' localhost:PORT/api/auth/sign-up/email
curl -b a.jar localhost:PORT/api/auth/get-session
```
Check: signed-out request to an owner route -> 401; user A creates a record; user B (`b.jar`) gets 404 on it;
sign-out then 401 again; wrong password -> error. Race tests use one user's jar.
Cleanup: delete the test users (`DELETE FROM "user" WHERE email LIKE '%@example.test'`; their sessions/accounts
cascade) and the domain rows they created, and remove the jar files.

## Gotchas
| Problem | Cause | Fix |
|---|---|---|
| Auth requests hang / body empty | `express.json()` ran before the Better Auth handler | mount `/api/auth/*` first |
| Origin / CSRF rejection on sign-up from curl (unverified here) | Better Auth checks the Origin header on cookie-bearing POSTs | send `Origin: http://localhost:PORT`; in prod set `BETTER_AUTH_URL` / `trustedOrigins` |
| Express 5 | wildcard syntax differs | `'/api/auth/*splat'` (template targets Express 4) |
| Sessions break behind a proxy | wrong protocol/host inferred | `trust proxy`, set `BETTER_AUTH_URL` |
| Secret missing in production | Better Auth refuses to start | set `BETTER_AUTH_SECRET` on the host |
| `import 'better-auth/db'` has no `getMigrations` | moved in recent versions | import from `better-auth/db/migration` |
