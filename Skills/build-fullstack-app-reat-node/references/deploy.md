# Build and deploy

The artifact is the whole repo folder (or the Docker image built from it). Runtime needs: Node >= 22,
`DATABASE_URL` (plus `PGSSL=true` for TLS-only `pg` hosts), `BETTER_AUTH_SECRET` (32+ chars; a NEW value per
environment, never the dev one) and `BETTER_AUTH_URL` (the public https URL), optional `PORT`. File databases (SQLite) need a persistent volume.

## Local production check
```bash
npm ci
npm run build          # vite build -> dist/
npm start              # NODE_ENV not required; production is the default mode
curl localhost:3000/api/health
curl -I localhost:3000/some/deep/link     # must return the SPA shell (200 text/html)
```

## Render + GitHub (default target; fully automated by two scripts)
Flow proven end to end on SkyBook: local commit -> GitHub push -> Render service via API -> env vars -> deploy ->
health check. Claude runs it itself once the user has supplied the inputs below.

**Ask the user for (only these, in one message):**
1. An **empty GitHub repo URL they created** (`https://github.com/OWNER/NAME`). Public is simplest (the code holds
   no secrets; Render can clone it without linking GitHub). If private, Render needs its GitHub app installed on
   that repo, which only the user can do.
2. A **Render API key** (Account Settings > API Keys). Claude cannot create one.
Tell the user to revoke the Render key afterwards, and to rotate the DB password if it was pasted into chat.

**Key handling:** write the key to a file in the scratchpad with the Write tool (never in a command line, never
echoed), pass `--key-file`, and delete the file at the end. Neither script prints secrets.

**Step A - GitHub** (`scripts/github-push.mjs`):
```bash
node ~/.claude/skills/build-fullstack-app-reat-node/scripts/github-push.mjs --repo https://github.com/OWNER/NAME --dir .
```
`git init -b main` if needed, refuses if `.env` or `node_modules` would be committed, commits (with the Claude
co-author trailer), points `origin` at `https://OWNER@github.com/OWNER/NAME.git`, pushes `HEAD:main` with
`GIT_TERMINAL_PROMPT=0`, then resets the remote to the plain URL. There is no `gh` CLI on the user's machine.
Lesson: Git Credential Manager may hold a DIFFERENT GitHub login (a work account) and the push dies with
`403 denied to <other-account>`. The `OWNER@` in the URL makes it use the stored login for the right account, which
fixed it on SkyBook. If it still fails (exit 2) do not search for credentials: ask the user to run
`cmdkey /delete:git:https://github.com` (browser sign-in follows) or to provide a fine-grained token.

**Step B - Render** (`scripts/deploy-render.mjs`):
```bash
node ~/.claude/skills/build-fullstack-app-reat-node/scripts/deploy-render.mjs --repo https://github.com/OWNER/NAME --name <slug> --key-file <scratchpad key file> --dir .
```
What it does through the Render REST API (`https://api.render.com/v1`): lists owners for the workspace id; looks
for an existing service with the same name and repo (idempotent: reuses it); otherwise `POST /services` as a
`web_service` (`runtime node`, plan `free`, region `oregon`, branch `main`, `autoDeploy yes`, health check
`/api/health`, build `npm ci --include=dev && npm run build`, start `npm start`) with env vars `NODE_VERSION=22`,
`DATABASE_URL` (read from the app's `.env`), a freshly generated `BETTER_AUTH_SECRET` (never the local one),
`BETTER_AUTH_URL` (guess), and `PGSSL` if set. Render adds a suffix when the name is taken
(`skybook` -> `skybook-9tkc.onrender.com`), so it then `PUT`s `BETTER_AUTH_URL` to the real URL, polls the latest
deploy until `live` (exit 3 on build/update failure, with the logs link), and checks `/api/health` (exit 4 if it
does not answer). Flags: `--plan`, `--region`, `--branch`, `--owner`, `--no-wait`.
Note: a service created through the API is NOT linked to `render.yaml`; editing the file later changes nothing.
Change settings through the API/dashboard (`PUT /services/{id}/env-vars/{key}`, `PATCH /services/{id}`).
`render.yaml` remains for users who prefer New > Blueprint in the dashboard (then `DATABASE_URL`/`BETTER_AUTH_URL`
are prompted there).

**Step C - verify the live site** (do it, then clean up): `/api/health` -> `{"ok":true}`; a deep link returns the
SPA shell; sign up a throwaway `@example.test` user; one real write (and the race test if the domain has one);
sign-out then 401; delete the test user and rows. The production service may share the dev database (it does
when the same `DATABASE_URL` is used), so cleanup is a local one-off script with the URL from `.env`.
Report the live URL, deploy status and anything not verified.

**Permissions:** pushing to GitHub, creating a Render service and setting its env vars are outward-facing; the
user's go-ahead plus supplying the repo and key is the authorisation. The auto-mode classifier may still block
running the deploy script against an existing production service; if it does, stop and tell the user rather than
working around it.

Render notes:
- Free web services spin down after ~15 minutes idle; the next request takes tens of seconds (plus a Neon
  wake-up). Not a bug; say so, and mention the paid plan for always-on.
- Services created on/after 2026-10-21 default to Node 24; `NODE_VERSION` pins 22 (matches `engines`).
- The first start runs `migrate()` + `migrateAuth()` and seeds an empty database; the database must be reachable
  from Render (Neon is).
- Redeploys: every push to `main` redeploys (auto-deploy). Changing an env var via the API does NOT reliably
  redeploy: start one with `POST /services/{id}/deploys` (`{}`), as `deploy-render.mjs` now does after correcting
  `BETTER_AUTH_URL`. Symptom of a stale value: sign-up returns `{"code":"INVALID_ORIGIN"}` while `/api/health` is fine.
  Always sign up a throwaway user on the live site (Step C) before reporting success.
- CRLF warnings from git on Windows are harmless.

## Hosts
| Host | Settings |
|---|---|
| Render (Web Service) | Use `render.yaml` (above). Manual equivalent: Build `npm ci --include=dev && npm run build`; Start `npm start`; env `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; health check `/api/health` |
| Railway | Same build/start; add `DATABASE_URL` variable; it injects `PORT` |
| Fly.io | `fly launch` (uses the Dockerfile), `fly secrets set DATABASE_URL=...` |
| Azure App Service / any Docker host | Build the Dockerfile, set `DATABASE_URL` as an app setting/secret |

Notes:
- Install must include devDependencies for the build step (Render/Railway do by default; if `NODE_ENV=production`
  is set at build time, use `npm ci --include=dev`).
- `PORT` is read from env. Bind is on all interfaces by Node default.
- If the database is Neon: use the **pooled** connection string (`-pooler` host) with `sslmode=require`.
- Neon free tier suspends idle compute; the first request after idle can take a second or two. Not a bug.
- Schema is created on every start by `migrate()`; the first deploy seeds an empty DB. Subsequent schema
  changes must be additive/idempotent in `schema.js`.

## Docker
`Dockerfile` in the template: multi-stage; stage 1 `npm ci` + `npm run build`; stage 2 `npm ci --omit=dev`
(+ copy `dist/`, `server/`, `shared/`). Build: `docker build -t app .`; run:
`docker run -p 3000:3000 -e DATABASE_URL=... app` (pass the value from your shell/secret store, do not
write it into files).

## Deploying on the user's behalf
Ask first which host/account. Don't `git push`, create cloud resources, or set env vars without a go-ahead
(for Render + GitHub the go-ahead plus the repo URL and API key the user supplies is enough to run the scripts).
After deploy: hit `/api/health`, load the home page, sign up a throwaway user, run one real write (create a
booking/order), then clean both up, and report the live URL plus anything not verified.
