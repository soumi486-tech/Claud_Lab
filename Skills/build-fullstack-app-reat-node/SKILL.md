---
name: build-fullstack-app-reat-node
description: Scaffold, build, verify and deploy a full-stack app as ONE Node process on ONE port (React + Vite SPA, Express 4 API, Better Auth user accounts, and a database the USER chooses every time - Neon, any Postgres, or other). Use for any booking/reservation or commerce-style domain - tennis courts, doctor appointments, salon slots, equipment rentals, meeting rooms, shops, ticketing, food delivery / restaurant ordering - or when the user asks for a "single-artifact" React + Express app.
---

# build-fullstack-app-reat-node

Builds a small, deployable full-stack app from a proven blueprint (the ShopEase eCommerce app, the SkyBook
airline app for seat inventory, plus the generic booking/reservation pattern). Output is **one deployable artifact**: Express serves `/api/*` and the built
React app from the same process and port. Never split frontend and backend into separate servers/packages.

Files in this skill:
- `scripts/scaffold.mjs` - copies `templates/base/` into the target dir, replacing name tokens.
- `templates/base/` - domain-agnostic skeleton (server infra, client infra, Dockerfile, CLAUDE.md, README).
- `references/learnings.md` - corrections and gotchas from past builds, incl. seat-inventory (flights, events, tables). **Read before writing code.**
- `references/booking-pattern.md` - schema/API/UI recipe for slots, appointments, rentals, rooms, courts.
- `references/commerce-pattern.md` - schema/API/UI recipe for catalog + cart + orders (the ShopEase blueprint).
- `references/food-delivery-pattern.md` - restaurants + menu + single-restaurant cart + order status lifecycle/tracking (commerce variant).
- `references/databases.md` - database options, questions to ask, porting notes. **The database is always asked, never assumed.**
- `references/auth.md` - Better Auth (email + password) wiring, env, verification recipe, gotchas. **Auth is included in every scaffold.**
- `scripts/github-push.mjs` - commits and pushes the app to a user-created GitHub repo (credential-safe).
- `scripts/deploy-render.mjs` - creates/reuses the Render web service via API, sets env vars, waits, health-checks.
- `references/deploy.md` - the automated Render + GitHub flow, Docker, other hosts, post-deploy checks.

## Workflow

### 1. Pin down the domain and ASK for the database
**Database + connection URL (mandatory, never assume, never default, every new workflow).**
Before anything else, ask with AskUserQuestion which database to use (Neon serverless Postgres, other
PostgreSQL via `pg`, other: MySQL/SQLite/SQL Server/MongoDB...). Then **explicitly ask for the connection URL
for THIS app**. Rules:
- Ask every time, even if an earlier app, `.env` elsewhere, scratch notes, chat history or memory has one. Never
  reuse or infer a URL from those; never pick a database because earlier apps used it.
- Don't proceed to scaffolding until you have the URL or the user has explicitly said they have none yet
  (then use `--allow-missing-url` and report "not tested against a real database").
- Handling: the user pastes it (or edits `.env` themselves). Write it only to `<app>/.env` as `DATABASE_URL=`;
  never put it on a command line, echo it, log it, document it, or commit it. Confirm receipt without repeating it.
- Also ask: does the database already exist, and is it OK to create tables (incl. Better Auth's `user`/`session`/`account`/`verification`) and seed demo data in it? Never run
  schema/seed against one the user says holds real data without explicit consent.
- If an answer is unclear or missing, ask again.

Then decide the rest, using defaults and stating them in the summary if the user hasn't said:
- **Pattern**: `booking` (time-slot reservations of a resource), `commerce` (catalog + cart + orders) or
  `food-delivery` (commerce + restaurants + order status tracking; `food-delivery-pattern.md`). Mixed
  domains (e.g. equipment rental = catalog + date-range booking) use the booking pattern with a catalog table.
  Unit inventory (seats, tables, tickets) -> see the seats section of `learnings.md`.
- **Entities & vocabulary**: resource (court / doctor / stylist / room / item), customer-facing nouns, slot length,
  operating hours, timezone, price rules, cancellation rule.
- **App name** and slug. Target dir: current dir if empty, else a new subfolder named by slug.
- **Credentials**: covered above. If scratch notes contain a live string, do not copy it; tell the user to rotate it.
- **Auth**: Better Auth with email + password is built in (`references/auth.md`). Decide which pages/routes are
  public (browse/search) and which need an account (book, order, view own records); default: browsing public,
  everything creating or reading personal records signed-in. Mention that no email verification / password reset
  exists unless the user asks for it.

Do not interrogate beyond that. If the request names a domain, proceed with sensible defaults.

### 2. Scaffold the base
```bash
node ~/.claude/skills/build-fullstack-app-reat-node/scripts/scaffold.mjs --name "CourtBook" --db <neon|postgres|other> --dir . [--description "Book tennis courts"]
```
(`~` resolves on Windows Git Bash too; in PowerShell use `$HOME\.claude\skills\...`.) `--db` is required (the answer from step 1) and the target `.env` must already hold the real `DATABASE_URL` the user gave (the script refuses placeholders unless `--allow-missing-url`) and selects `server/db.js`, the driver dependency and docs. It refuses to overwrite
existing files unless `--force`. It also appends a generated `BETTER_AUTH_SECRET` to `.env` (not printed) unless one exists. It prints the files created. Then `npm install`.

### 3. Build the domain on top (read the matching pattern reference first)
Edit these, in this order, keeping the base conventions:
1. `server/schema.js` - idempotent `CREATE ... IF NOT EXISTS` DDL (a JS module, not `.sql`).
2. `server/seed.js` - export `seed(query, withTransaction)`; return early if the table already has rows.
3. `shared/*.js` - pricing / slot / availability rules used by BOTH client (display) and server (authoritative).
4. `server/api.js` - routes. Async handlers wrapped in `route()`, client errors via `HttpError`. Add `toX`
   mappers that convert `numeric` strings to numbers. Owner-scoped routes get the owner from `customerId(req)`
   (the signed-in user id; 401 when signed out); public reads don't call it.
5. `src/api/client.js` - one function per endpoint. `src/pages`, `src/components`, `src/context` for UI.
   Wrap pages that need an account in `<RequireAuth>`; the Better Auth pages/header are already scaffolded.
6. `src/App.jsx` routes + `Header` nav; `src/index.css` tokens (restyle brand colors per domain).

Trust boundary: the client sends **intent only** (ids, quantities, slot start, user details). The server looks
up prices, durations, availability and computes every total, inside one transaction with row locks.

### 4. Verify (there is no test suite - you are the test suite)
1. `npm run build` must pass.
2. `npm run dev`, then in another shell hit every endpoint with curl. For owner-scoped routes sign up two
   throwaway users with cookie jars (recipe in `references/auth.md`). Check: signed-out -> 401, happy path,
   validation 400s, unknown id 404, conflict 409, and **ownership** (user B cannot read/cancel user A's records).
3. **Race test** the critical write: fire 3-5 concurrent identical requests (same jar) for the last unit / same
   slot (`curl ... & curl ... & wait`). Exactly one must succeed; the rest must be 409.
4. Clean up the test rows you created (or reset stock/slots) AND the throwaway users/jar files, so the
   database is left as seeded.
5. Confirm the dev server does not restart-loop (watch the console for ~10 s after the first request).
6. Actually look at the UI when a browser tool is available (see `run` / browser skills); otherwise say that
   the UI was build-checked only. Do not claim UI verification you did not do.

### 5. Document
Fill the generated `CLAUDE.md` (architecture, where state lives, trust boundary, gotchas specific to the new
domain) and `README.md` (setup, run, deploy, API table). Remove sections that don't apply. Keep CLAUDE.md
terse and non-obvious; don't duplicate what the code shows.

### 6. Deploy (only on request; confirm the target first)
Follow `references/deploy.md`. Deploying, pushing to a remote, or setting host env vars is outward-facing:
confirm the host before doing it. **Render is the default and is fully automated**: once the user says deploy,
ask for just two inputs in one message: (1) an EMPTY GitHub repo URL they created, (2) a Render API key. Then run
yourself, in order: `scripts/github-push.mjs` (commit + push, fixes the wrong-cached-account 403 via `OWNER@` in the
remote URL), `scripts/deploy-render.mjs` (creates/reuses the Render web service through the API, sets
`DATABASE_URL` from the app's `.env`, generates a fresh `BETTER_AUTH_SECRET`, corrects `BETTER_AUTH_URL` to the real
suffixed URL, waits for the deploy, checks `/api/health`), then verify the live site and clean up (Step C in
`deploy.md`). Keys go through a scratchpad file and `--key-file`, never a command line or chat; tell the user to
revoke the Render key afterwards. If the permission classifier blocks a deploy action, stop and report; do not
work around it. Other hosts (Railway, Fly.io, Azure, containers) are in `deploy.md`. Without a deploy request,
stop after verifying and give the user the exact steps.

## Hard rules (each one cost real time before)
- One process, one port, one artifact. `server/index.js` mounts `/api`, then Vite middleware (`--dev`) or `dist/`.
- `server/env.js` is the **first import** of `server/index.js`; load `.env` in code. No `node --env-file`.
- Never read files under `server/` or `shared/` at runtime (Windows `--watch-path` restart loop).
- Express 4: wrap every async handler in `route()`.
- `numeric` -> string in node-postgres: always map through `toX` before `res.json`.
- Multi-statement writes use `withTransaction`; contended rows use `SELECT ... FOR UPDATE` (or a DB constraint).
- Never trust client prices/totals/durations. Never accept full card numbers (last 4 only, demo payments).
- No secrets in repo, docs, skill files, or chat output. `.env` stays gitignored.
- React/Vite/router are devDependencies (build-time only); build before pruning.
- Database AND its connection URL are the user's, asked explicitly for every new workflow, never reused or assumed (`references/databases.md`). Never hardcode Neon.
- Prefer minimal dependencies: express, better-auth, the chosen DB driver, react, react-dom, react-router-dom, vite.
- Auth is Better Auth (`references/auth.md`). Mount `/api/auth/*` BEFORE `express.json()`; `customerId(req)` in
  `server/http.js` is the only way routes learn the owner (the signed-in user id, 401 otherwise). Never accept an
  owner/user id from the client. Never put `BETTER_AUTH_SECRET` anywhere but `.env`/host secrets.
