# Learnings and corrections (read before coding)

Sources: the ShopEase eCommerce build (verified in its code and session history) and the booking pattern.
The tennis-booking project was not available on the machine when this skill was written, so booking-specific
items below are standard correct practice, marked **(booking)**, not recalled corrections. If the tennis app
becomes available, diff it against `booking-pattern.md` and fold in its fixes.

Third blueprint: the SkyBook airline-booking app (verified in its CLAUDE.md). Its items are marked **(seats)**.

## Process learnings (how the user wants to work)
0. **Always ask which database to use; never assume.** (Explicit user requirement for this skill.) Neon was used in
   past builds only because the user chose it then.
1. **Staged build works well**: first a UI-only app with mocked data + localStorage that the user can test,
   then Express, then Postgres. When starting fresh, still end at the full stack, but keep each layer
   separable (client talks only via `src/api/client.js`).
2. **Single artifact is a stated requirement.** The user said: "Keep the application structure simple so that
   I can deploy this as a single artifact. I don't want to maintain and start separate frontend and backend
   components." Do not propose a monorepo with two servers.
3. **Launch the app and show it** after changes ("launch the application" was asked repeatedly). Start the dev
   server and give the URL; open it if a browser tool exists.
4. **Test against the real database** before saying it works; then clean up test data. Say plainly what was
   and wasn't tested (before getting a connection string, report "not tested against a real DB").
5. **Generate CLAUDE.md** at the end of a build (commands, architecture, gotchas). Don't repeat obvious advice.
6. The user keeps scratch notes containing connection strings. Never copy credentials from notes/chat into
   files. If you see a live secret in a notes file, tell the user to rotate it.

## Technical gotchas
| Problem | Cause | Fix |
|---|---|---|
| Dev server restarts about once a second (Windows) | `node --env-file=.env` in `--watch` mode counts the `.env` read as a change | Load env in code: `process.loadEnvFile` in `server/env.js`, imported FIRST |
| Same loop risk from reading files at runtime | `--watch-path=server` sees reads of `server/*` | Schema is a JS module (`schema.js`), not `schema.sql`; never `readFile` under `server/` or `shared/` |
| Money/ratings show as strings, `"19.99" + 1` bugs | Postgres `numeric` returns strings | `toProduct` / `toOrder` style mappers with `Number()` |
| Unhandled rejection hangs request / crashes | Express 4 ignores rejected promises | `route(fn)` wrapper -> `next(err)` |
| Overselling under concurrency | check-then-write race | one transaction, `SELECT ... FOR UPDATE ... ORDER BY id` (stable lock order avoids deadlocks) |
| Duplicate cart lines inflate/skip stock checks | client sends the same id twice | merge duplicates in a Map before the transaction |
| Client price tampering | trusting request totals | client sends `{id, qty}` only; server reads price from DB and calls `shared/pricing.js` |
| Order history changes when catalog changes | joining live product rows | copy name/price (and emoji/colour) into `order_items` at purchase time |
| SPA deep links 404 on refresh in production | static server only knows `/` | `app.get('*')` -> `dist/index.html` AFTER `/api` and static |
| Unknown `/api/x` returns HTML | SPA fallback swallowed it | `api.use` JSON 404 handler inside the router (mounted before the fallback) |
| Prod build lacks vite after `npm prune` | React/Vite are devDependencies | `npm ci && npm run build` first; then prune (Dockerfile does this) |
| HMR websocket fails behind single port | Vite opened its own port | `server: { middlewareMode: true, hmr: { server } }` sharing the http.Server |
| `.env` ignored on host | hosts inject env vars; `.env` absent | `env.js` swallows ENOENT only; real env vars win because `loadEnvFile` does not override existing ones |
| Server starts then dies on first query | `DATABASE_URL` missing | db.js exits at startup with a clear message pointing at `.env.example` |
| Users see each other's data | missing owner scoping | Better Auth session -> `customerId(req)` (user id) scopes every read AND every write; return 404 (not 403) for others' records. Earlier blueprints used an anonymous `X-Customer-Id` header; superseded by real accounts (`references/auth.md`) |
| `git push` 403 "denied to <other-account>" | Git Credential Manager cached another GitHub login (e.g. a work account) | remote URL `https://OWNER@github.com/OWNER/NAME.git` selects the stored login for OWNER; else user runs `cmdkey /delete:git:https://github.com`; never read stored credentials |
| No `gh` CLI, nothing to create repos with | user machine | user creates the EMPTY repo; Claude only pushes (`scripts/github-push.mjs`) |
| Render service URL differs from the name (`skybook-9tkc`) | name already taken, Render appends a suffix | `deploy-render.mjs` reads `serviceDetails.url` and PUTs `BETTER_AUTH_URL` to it (auth origin checks need it) |
| Editing `render.yaml` changes nothing | service was created via API, not Blueprint | change settings via API/dashboard |
| Stray `node server/index.js --dev` processes keep restarting and hold ports | watch mode outlives its shell | find and stop them before assuming a port is free; use `PORT=3100` if 3000 is taken |
| Better Auth requests hang | `express.json()` registered before the auth handler | `app.all('/api/auth/*', toNodeHandler(auth))` first, then `/api` router |
| Signed-out user hits booking flow | page not guarded | `<RequireAuth>` on those routes; browsing stays public; client `request()` surfaces `error.status === 401` |
| localStorage throws (private mode/quota) | browsers | `storage.js` wraps get/set in try/catch, falls back to memory |
| Fetch 404 on a detail page crashes UI | client throws on 404 | `client.js`: GET 404 resolves to `null`; page renders "not found" |
| Natural id ordering (p1, p2, p10) | text sort | `ORDER BY length(id), id` for short prefixed ids (or use a sort column) |
| Slow cold start, repeated migrations | n/a | `migrate()` runs on every start; DDL must be idempotent and the seed must early-return if data exists |

## Booking-specific (apply when the domain is slots/appointments/rentals) **(booking)**
- Store instants as `timestamptz` (UTC); keep a per-location IANA timezone string; render in that zone.
  Do date math server-side with explicit zones; never trust the browser's local timezone for availability.
- Prevent double-booking in the **database**, not just in code: lock the resource row `FOR UPDATE`, re-check
  overlap inside the transaction, AND add an exclusion constraint (`btree_gist` + `tstzrange`) as a backstop.
  Map the constraint violation (`23P01`) to HTTP 409.
- Availability is computed on the server from operating hours + existing non-cancelled bookings + "now".
  Reject past slots and slots off the grid (`start % slotMinutes != 0`) with 400.
- Cancellation sets `status='cancelled'` (keeps history, frees the slot via a partial constraint
  `WHERE status <> 'cancelled'`). Enforce the cancellation window on the server.
- Copy price and resource name onto the booking at booking time (same reason as `order_items`).
- Pricing from `shared/pricing.js` (peak/off-peak, duration, member discounts): UI shows it, server decides it.

## Seat / unit-inventory bookings (flights, events, cinema, tables) **(seats)**
- One row per reserved unit (`booking_passengers`-style: one row per seat) with an `active` flag, plus a partial
  unique index `(parent_id, seat) WHERE active` as the backstop. Lock the parent row `FOR UPDATE`, re-check
  seats, insert; map `23505` -> 409. Cancel sets `active=false`, which frees the units.
- Short human-friendly booking ids (6-char PNR-style) instead of UUIDs; retry on collision.
- Derive unit -> category (seat -> cabin) from one shared layout module and reject mismatches on the server.
- Copy flight number/route/times/price onto the booking at booking time; history never joins live rows.
- Store instants as UTC `timestamptz`, always render in the location's IANA zone (`src/lib/format.js`).
  "Date" in search means the calendar day at the origin: one `dayWindow` helper in `shared/time.js`.
- Dynamic pricing (advance-purchase factor depends on "now"): the displayed price may differ slightly from the
  final one. Server recomputes, stores fare/taxes/total, and the booking response is authoritative; say so in the UI.
- Seed generates a rolling window (next 30 days) and re-runs on start when no future rows remain.
- Persist search form, contact and passenger names in localStorage (prefix `skybook:`), never payment data.
  No payments/emails exist: the UI must say so.
- Keep CLAUDE.md updated with these domain specifics at the end of the build.
