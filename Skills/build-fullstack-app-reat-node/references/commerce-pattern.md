# Commerce pattern (the ShopEase blueprint)

Use for shops, menus, ticket/merch stores, any catalog + cart + checkout. Reference implementation: the
`Ecommerce` project (server/api.js, server/schema.js, shared/pricing.js, src/context/ShopContext.jsx).

## Schema
- `products(id text pk, name, category, description, price numeric(10,2) CHECK >=0, rating numeric(2,1),
  stock integer CHECK >=0, emoji, color)`
- `orders(id text pk, customer_id, created_at timestamptz, status, shipping_info jsonb, subtotal, shipping_cost,
  tax, total)` + index `(customer_id, created_at DESC)`
- `order_items(order_id fk ON DELETE CASCADE, product_id fk, name, price, qty CHECK >0, emoji, color,
  pk(order_id, product_id))` - **name/price copied at purchase time**.

## Shared rules
`shared/pricing.js`: constants (`SHIPPING_FLAT`, `FREE_SHIPPING_OVER`, `TAX_RATE`), `round2`, and
`computeTotals(lines)` returning `{subtotal, shipping, tax, total}`. Used by `ShopContext` for display and by
`POST /orders` as authority.

## API
`GET /products`, `/products/:id` (404), `/categories`, `/orders`, `/orders/:id` (owner-scoped via `customerId(req)`; 401 signed out),
`POST /orders` with `{items:[{id,qty}], shipping:{name,email,address,city,zip,cardLast4}}`.

`POST /orders` algorithm (copy exactly): validate body -> merge duplicate ids in a `Map` -> `withTransaction`:
`SELECT * FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE` -> unknown id 400, qty > stock 409
("Only N of X left in stock") -> `computeTotals` -> insert order, then per line decrement stock + insert
item -> return the order -> 201. Order id: `'ORD-' + Date.now().toString(36).toUpperCase() + randomBytes(2).hex`.

## Client
- `ShopContext` (useReducer + localStorage persistence): cart add/setQty/remove/clear, wishlist toggle,
  `totals = computeTotals(cart)`. Clamp qty to stock. Cart lines snapshot name/price/stock for display only.
- Pages: Catalog (search, category filter, sort), ProductDetail, Cart, Checkout (validation, saved shipping,
  only last 4 card digits sent), OrderConfirmation, Orders, Wishlist, NotFound.
- Checkout redirects to `/cart` when empty **unless submitting** (otherwise clearing the cart after success
  bounces the user before navigation to the confirmation page).
- On 409 show the server message and let the user adjust the cart.

## Verification extras
- Duplicate lines merge; totals match `computeTotals`; stock decrements.
- 3 concurrent orders for stock=2 -> 2x201, 1x409, final stock 0 (or expected remainder).
- Other customer id -> 404 on `/orders/:id`. Reset stock and delete test orders afterwards.
