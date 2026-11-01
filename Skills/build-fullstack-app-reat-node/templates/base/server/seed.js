// Initial data. Must be a no-op when the database already has rows.
// TODO(domain): replace the placeholder with real seed rows.
const seedItems = [{ id: 'i1', name: 'Example item' }];

export async function seed(pool, withTransaction) {
  const { rows } = await pool.query('SELECT count(*)::int AS n FROM items');
  if (rows[0].n > 0) return;

  await withTransaction(async (tx) => {
    for (const i of seedItems) {
      await tx.query('INSERT INTO items (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING', [i.id, i.name]);
    }
  });
  console.log(`Seeded ${seedItems.length} items`);
}
