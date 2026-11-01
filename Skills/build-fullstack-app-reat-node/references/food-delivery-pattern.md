# Food delivery pattern (commerce + order lifecycle)

Use for restaurant/grocery/meal-kit/bakery ordering with delivery or pickup. It is the **commerce pattern**
(`commerce-pattern.md`) plus restaurants, a single-restaurant cart, a delivery address, and an order status
lifecycle. Read `commerce-pattern.md` and `learnings.md` first; only the differences are listed here.
Database is still asked first (`databases.md`); nothing here assumes one.

## Schema (idempotent DDL in `server/schema.js`)
- `restaurants(id text pk, name, cuisine, description, rating numeric(2,1), eta_min int, eta_max int,
  delivery_fee numeric(10,2) CHECK >=0, min_order numeric(10,2) CHECK >=0, open_time, close_time, tz text,
  is_open boolean, emoji, color)`
- `menu_items(id text pk, restaurant_id fk, category, name, description, price numeric(10,2) CHECK >=0,
  veg boolean, available boolean default true, emoji, color)` + index `(restaurant_id, category)`
- `orders(id text pk, customer_id, restaurant_id, restaurant_name, created_at timestamptz, status text
  CHECK in ('placed','accepted','preparing','out_for_delivery','delivered','cancelled'), fulfilment
  ('delivery'|'pickup'), address jsonb, notes, subtotal, delivery_fee, tax, tip, total)` + index
  `(customer_id, created_at DESC)`
- `order_items(order_id fk ON DELETE CASCADE, item_id, name, price, qty CHECK >0, pk(order_id, item_id))` -
  name/price copied at order time.
- `order_events(order_id fk, status, at timestamptz default now())` - status history for the tracker UI.
- Users' saved addresses: keep in localStorage (`storage.js`), not a table, unless the user asks for one.

## Shared rules (`shared/pricing.js`)
`computeTotals({lines, restaurant, fulfilment, tip})` -> `{subtotal, deliveryFee, tax, tip, total}`.
Pickup => fee 0. Tip is clamped to `[0, 50% of subtotal]`. `round2` everywhere. Client displays, server decides.
`shared/status.js`: ordered `STATUSES`, allowed transitions, labels; used by tracker UI and the API.

## API
Public: `GET /restaurants?q=&cuisine=`, `/restaurants/:id` (with menu grouped by category), `/cuisines`.
Owner-scoped (`customerId(req)`, 401 signed out): `GET /orders`, `/orders/:id` (404 for others),
`POST /orders`, `POST /orders/:id/cancel`.

`POST /orders` body: `{restaurantId, items:[{id,qty}], fulfilment, address, notes, tip}` (never prices).
Algorithm: validate -> merge duplicate ids -> `withTransaction`: load restaurant (400 unknown, 409 closed - check
open hours in the restaurant's `tz` on the server) -> `SELECT ... FROM menu_items WHERE id = ANY($1) ORDER BY id`
-> every item must belong to that restaurant (400 otherwise, this is the single-restaurant-cart rule) and be
`available` (409 "X is no longer available") -> subtotal < `min_order` => 409 -> `computeTotals` -> insert order
(`placed`), items, first `order_events` row -> 201. No stock decrement unless the user wants limited quantities;
if they do, add `stock` and lock rows `FOR UPDATE` exactly as in the commerce pattern.

Cancel: allowed only while `placed`/`accepted` (enforce on the server, 409 otherwise); sets `cancelled`, adds an event.

## Order status progression (no real kitchen/rider exists)
Do not fake a backend worker silently. Default: a **demo simulator** - `GET /orders/:id` derives the displayed
status from elapsed time since `created_at` (placed -> accepted 30s -> preparing 2m -> out_for_delivery 6m ->
delivered 12m), persists the advance with an `UPDATE ... WHERE status = <old>` and an `order_events` row, and
skips cancelled orders. State this in the UI ("demo tracking") and in the summary. If the user wants staff/rider
roles, add an admin role to Better Auth and a guarded `PATCH /orders/:id/status` using the transition table.

## Client
- `CartContext` (useReducer + localStorage): lines belong to ONE restaurant. Adding from a different restaurant
  asks "Start a new order? This clears your current cart" before replacing.
- Pages: Restaurants (search, cuisine chips, open/closed badge, ETA), RestaurantMenu (category tabs, veg
  filter, add/qty steppers, sticky cart bar), Cart/Checkout (`RequireAuth`; delivery/pickup toggle, address
  form, tip presets, totals from `computeTotals`, demo payment: last 4 only), OrderTracking (status stepper
  from `order_events`, polls every ~5s while not delivered/cancelled, stops on unmount), Orders, NotFound.
- Checkout redirects to the cart when empty unless submitting (same fix as ShopEase).
- Show server 409 messages (closed, unavailable item, below minimum) and let the user fix the cart.
- Currency/format helpers in `src/lib/format.js`; times in the restaurant's zone.

## Verification extras
- Item from another restaurant in the body -> 400; unavailable item -> 409; below minimum -> 409; closed -> 409.
- Pickup has no delivery fee; tip clamped; totals equal `computeTotals`; duplicate lines merge.
- Order visible only to its owner (second throwaway user gets 404); cancel after `preparing` -> 409.
- Simulator advances status monotonically and is idempotent under concurrent `GET`s (fire 3 at once).
- Delete test orders, events, throwaway users and cookie jars afterwards.
