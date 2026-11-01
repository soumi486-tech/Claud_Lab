# __APP_NAME__

__APP_DESCRIPTION__

React + Vite frontend and a Node.js + Express API, run as **one process on one port**. Express serves both
`/api/*` and the React app. Data is stored in __DB_LABEL__.

## Setup

__DB_SETUP__

On startup the server creates the tables (`server/schema.js`) and seeds an empty database (`server/seed.js`).

## Run

```bash
npm install
npm run dev        # http://localhost:3000, Vite runs inside Express with hot reload
```

## Deploy (single artifact)

```bash
npm ci
npm run build      # builds the React app into dist/
npm start          # Express serves dist/ + /api on $PORT (default 3000)
```

Or build the included `Dockerfile`. React/Vite are dev dependencies (build-time only), so build before pruning.

| Env var        | Default | Purpose                                    |
|----------------|---------|--------------------------------------------|
| `DATABASE_URL` | none    | __DB_LABEL__ connection string (required)  |
| `PORT`         | `3000`  | HTTP port                                  |
| `BETTER_AUTH_SECRET` | none | Session signing secret, 32+ chars (required) |
| `BETTER_AUTH_URL` | inferred locally | Public URL of the app (required in production) |

Never commit `.env`.

## API

| Method | Path          | Notes          |
|--------|---------------|----------------|
| GET    | `/api/health` | Liveness check |
| *      | `/api/auth/*` | Better Auth (sign-up/sign-in/sign-out/session) |

TODO(domain): document the routes.

## Structure

```
server/   index.js (entry), api.js (routes), http.js (helpers), db.js, schema.js, seed.js, env.js
shared/   rules used by both client and server
src/      React app (api/client.js wraps fetch calls to /api)
```
