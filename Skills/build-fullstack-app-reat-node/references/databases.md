# Database choice (always asked, never assumed)

The user must pick the database every time. Do not default to Neon, even though both blueprints (ShopEase,
SkyBook) used it. `scaffold.mjs` refuses to run without `--db`.

## Options and what the scaffold does
| Choice | `--db` | Driver | Notes |
|---|---|---|---|
| Neon serverless Postgres | `neon` | `@neondatabase/serverless` | Use the POOLED string (`-pooler` host), `sslmode=require`. Idle compute suspends: first request can be slow. |
| Any other PostgreSQL (local, Docker, RDS, Azure, Supabase, Railway...) | `postgres` | `pg` | Set `PGSSL=true` if TLS is required. |
| MySQL/MariaDB, SQLite, SQL Server, MongoDB, other | `other` | you wire it | `server/db.js` is a stub with the required exports; port schema/locking per below. |

All variants export `pool.query(sql, params) -> { rows }`, `withTransaction(fn)`, `migrate()`. `api.js` and
`seed.js` depend only on that, so keep it when writing an adapter.

## Questions to ask with the choice (every new workflow)
1. Which database (above)?
2. **The connection URL for this app, explicitly.** Never reuse one from another project, notes, memory or an
   old `.env`; if you notice one there, still ask, and tell the user to rotate it if it sits in plain notes.
   It goes into `<app>/.env` only (`scaffold.mjs` reads it from there and refuses placeholders).
3. Does the database exist already, and may tables be created and demo data seeded? Never touch one with real
   data without explicit consent.
4. If the user has no URL yet: scaffold with `--allow-missing-url` and report nothing was tested against a real DB.

## Porting to a non-Postgres database (`other`)
Postgres features the patterns rely on, and what replaces them:
| Used for | Postgres | Elsewhere |
|---|---|---|
| Row lock before availability re-check | `SELECT ... FOR UPDATE` | MySQL/InnoDB same; SQLite: `BEGIN IMMEDIATE` (single writer); SQL Server: `WITH (UPDLOCK, ROWLOCK)`; MongoDB: single-doc atomic `findOneAndUpdate` with a guard |
| Double-booking backstop | partial unique index `WHERE active`; `tstzrange` exclusion constraint | MySQL: unique key on a generated column (NULL when inactive); SQLite supports partial unique indexes; otherwise a slot-row-per-unit unique key |
| Conflict error mapping | `23505`/`23P01` -> 409 | MySQL `ER_DUP_ENTRY` (1062); SQLite `SQLITE_CONSTRAINT_UNIQUE`; Mongo code 11000 |
| Decimals | `numeric` comes back as string | same trap in many drivers: convert in `toX` mappers |
| Instants | `timestamptz` (UTC) | store UTC explicitly (ISO text / DATETIME in UTC); never rely on server-local time |
| Placeholders | `$1,$2` | `?` (MySQL/SQLite) - adapt in `db.js` so route code is unchanged |
| Idempotent DDL | `CREATE TABLE IF NOT EXISTS` | supported in MySQL/SQLite; SQL Server needs `IF OBJECT_ID(...)` |

Embedded/file databases (SQLite) break the "stateless host" assumption: the file needs a persistent volume on the
deploy target. Say so before choosing a host.

Better Auth also needs the database: `server/auth.js` passes the Postgres pool straight in; for other databases
swap in the matching Better Auth adapter (`references/auth.md`). Its tables (`user`, `session`, `account`,
`verification`) live in the same database, so tell the user they will be created there.

Whatever the database, the race test in SKILL.md step 4 still applies.
