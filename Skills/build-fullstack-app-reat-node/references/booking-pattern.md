# Booking pattern (courts, doctors, salon, rooms, equipment rentals)

Vocabulary map - pick names for the domain and use them everywhere (tables, routes, UI):
| Domain | resource | booking | slot unit |
|---|---|---|---|
| Tennis | court | reservation | 60 min |
| Doctor | doctor / clinic room | appointment | 15-30 min |
| Salon | stylist (+ service) | appointment | service duration |
| Meeting rooms | room | booking | 30 min |
| Equipment rental | item | rental | day(s) - use `daterange` |

## Schema (put in `server/schema.js`, idempotent)
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS resources (
  id            text PRIMARY KEY,
  name          text NOT NULL,
  category      text NOT NULL DEFAULT '',
  description   text NOT NULL DEFAULT '',
  price_per_slot numeric(10,2) NOT NULL CHECK (price_per_slot >= 0),
  slot_minutes  integer NOT NULL DEFAULT 60 CHECK (slot_minutes > 0),
  open_hour     integer NOT NULL DEFAULT 8,   -- local, inclusive
  close_hour    integer NOT NULL DEFAULT 22,  -- local, exclusive
  timezone      text NOT NULL DEFAULT 'UTC',
  active        boolean NOT NULL DEFAULT true,
  emoji         text NOT NULL DEFAULT '',
  color         text NOT NULL DEFAULT '#f1f5f9'
);

CREATE TABLE IF NOT EXISTS bookings (
  id            text PRIMARY KEY,
  customer_id   text NOT NULL,
  resource_id   text NOT NULL REFERENCES resources (id),
  resource_name text NOT NULL,                 -- copied at booking time
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL CHECK (ends_at > starts_at),
  status        text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','cancelled')),
  contact       jsonb NOT NULL,
  price         numeric(10,2) NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_at  timestamptz,
  EXCLUDE USING gist (resource_id WITH =, tstzrange(starts_at, ends_at) WITH &&)
    WHERE (status <> 'cancelled')
);
CREATE INDEX IF NOT EXISTS bookings_customer_idx ON bookings (customer_id, starts_at DESC);
```
Caveat: `EXCLUDE` inside `CREATE TABLE IF NOT EXISTS` only applies on first creation. For schema changes later,
add idempotent `ALTER TABLE` / `DO $$ ... $$` blocks to `schema.js` (or adopt node-pg-migrate).

## Shared rules (`shared/slots.js`)
Pure functions importable by client and server: `slotStartsForDate(resource, 'YYYY-MM-DD')`,
`priceFor(resource, startsAt, slots)`, `CANCEL_WINDOW_HOURS`. Keep zone handling with `Intl.DateTimeFormat`
(no heavy date libraries needed for fixed-grid slots). Server remains the authority.

## API
| Method | Path | Notes |
|---|---|---|
| GET | `/api/resources` | active resources (`toResource` mapper) |
| GET | `/api/resources/:id` | 404 if missing |
| GET | `/api/resources/:id/availability?date=YYYY-MM-DD` | `[{start, end, available, price}]`, excludes past |
| GET | `/api/bookings` | signed-in user only (`customerId(req)`, 401 otherwise), upcoming + past |
| GET | `/api/bookings/:id` | 404 for other customers' ids |
| POST | `/api/bookings` | `{resourceId, start, contact}` -> 201; 400 invalid/past/off-grid; 409 taken |
| POST | `/api/bookings/:id/cancel` | owner only; enforces cancel window; idempotent on already-cancelled |

Create flow inside `withTransaction`: `SELECT ... FROM resources WHERE id=$1 AND active FOR UPDATE` -> validate
grid/hours/not past in the resource's zone -> check overlap query -> INSERT with server-computed price/end.
Catch `err.code === '23P01'` and rethrow `HttpError(409, 'That time was just taken')`.
Multi-slot or multi-resource requests: lock rows in a stable order (`ORDER BY id`).

## UI
Pages: `Home/Resources` (grid + filter) -> `ResourceDetail` (date picker + slot grid, disabled taken/past slots)
-> `Confirm` (contact form, price summary from shared rules) -> `BookingConfirmation` -> `MyBookings`
(cancel button, upcoming/past tabs) -> `NotFound`. Show loading, empty and error states on every page.
Re-fetch availability after a 409 and show the message inline. Persist contact details (not payment) in
localStorage under the app prefix. No cart: booking is one step, optionally a "hold" screen if payment is added.

## Verification extras
- Race: 5 concurrent POSTs for the same slot -> 1x 201, 4x 409.
- Adjacent slots (10:00-11:00 and 11:00-12:00) must both succeed (`tstzrange` is half-open).
- Past start -> 400. Cancel inside window -> 409/400. Other customer cancel -> 404. Re-cancel -> 200 no-op.
- Cancel then rebook the same slot succeeds (partial constraint).
