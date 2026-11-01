// Idempotent schema, applied on every server start. Keep it a JS module (not .sql):
// reading files under server/ at runtime triggers dev restart loops on Windows.
// TODO(domain): replace with real tables. See references/booking-pattern.md or commerce-pattern.md.
export const schema = `
CREATE TABLE IF NOT EXISTS items (
  id   text PRIMARY KEY,
  name text NOT NULL
);
`;
