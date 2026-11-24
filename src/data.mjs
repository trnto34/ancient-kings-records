import { BRAND, CATEGORIES } from './config.mjs';

const placeholderDescription = 'A sample listing for the storefront preview. Artwork, price and stock illustrate the catalogue layout.';
const samples = [
  ['the-silent-keep', 'The Silent Keep', 'cassette', 'Dungeon synth', 1200, 12, 0, 'cassettes', 1],
  ['under-the-iron-gate', 'Under the Iron Gate', '12″ LP', 'Black metal', 2400, 8, 1, 'vinyl-lps,special-editions', 0],
  ['the-stone-circle', 'The Stone Circle', 'digipak CD', 'Dark ambient', 1450, 9, 2, 'cds', 0],
  ['from-the-crypt', 'From the Crypt', '7″ EP', 'Black metal', 1350, 0, 3, 'eps', 0],
  ['beyond-the-crags', 'Beyond the Crags', '2×LP', 'Dungeon synth', 3250, 6, 4, 'vinyl-lps,double-lps,special-editions', 1],
  ['notes-from-the-archive', 'Notes from the Archive', 'printed zine', 'Medieval folk', 800, 15, 5, 'zines-and-publications', 0],
  ['keep-shirt', 'Keep Illustration', 'T-shirt', '', 2250, 4, 0, 'shirts,merchandise', 0],
  ['the-moss-beneath', 'The Moss Beneath', 'CD', 'Dark ambient', 1050, 3, 3, 'cds', 0, 1450],
  ['shadows-on-the-pass', 'Shadows on the Pass', 'cassette', 'Black metal', 1150, 6, 1, 'cassettes', 0],
  ['the-lost-marches', 'The Lost Marches', '12″ LP', 'Dungeon synth', 2100, 4, 4, 'vinyl-lps', 0, 2650],
  ['the-solstice-stone', 'The Solstice Stone', 'CD EP', 'Medieval folk', 1050, 0, 2, 'cds,eps', 0],
  ['archive-map-print', 'Archive Map', 'art print', '', 950, 11, 5, 'merchandise', 0],
  ['pines-at-dusk', 'Pines at Dusk', 'cassette', 'Dark ambient', 1000, 7, 0, 'cassettes', 0],
];

export function statement(db, sql, values = []) {
  return db.prepare(sql).bind(...values);
}

export async function all(db, sql, values = []) {
  return (await statement(db, sql, values).all()).results;
}

export async function first(db, sql, values = []) {
  return await statement(db, sql, values).first();
}

export function run(db, sql, values = []) {
  return statement(db, sql, values).run();
}

export async function seedCatalogue(db, demo) {
  const categories = CATEGORIES.map(([slug, name, description, rule], position) =>
    statement(db, 'INSERT OR IGNORE INTO categories (slug, name, description, rule, position) VALUES (?, ?, ?, ?, ?)',
      [slug, name, description, rule, position]));
  await db.batch(categories);
  if (!demo || await first(db, 'SELECT id FROM products LIMIT 1')) return;

  const artists = ['A', 'B', 'C'].map((letter, index) => statement(db, `
    INSERT OR IGNORE INTO artists (slug, name, bio, artwork, sample) VALUES (?, ?, ?, ?, 1)`,
  [`sample-artist-${letter.toLowerCase()}`, `Sample Artist ${letter}`, 'This placeholder profile shows how artist biographies and releases will appear.',
    `/assets/sleeve-${index}.webp`]));

  const products = samples.flatMap(([slug, title, format, genre, price, stock, cover, groups, featured, list], index) => {
    const artistSlug = genre ? ['sample-artist-a', 'sample-artist-b', 'sample-artist-c'][cover % 3] : '';
    const product = statement(db, `
      INSERT OR IGNORE INTO products
        (slug, title, artist_id, format, genre, price_cents, list_cents, stock, active, sample, featured,
         label, catalogue_number, release_date, description, tracklist, images, created_at)
      VALUES (?, ?, (SELECT id FROM artists WHERE slug = ?), ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, unixepoch() - ?)`,
    [slug, title, artistSlug, format, genre, price, list ?? null, stock, featured, BRAND,
      `DEMO-${String(index + 1).padStart(2, '0')}`, `2025-01-${String(20 - index).padStart(2, '0')}`,
      placeholderDescription, genre ? 'Sample track I\nSample track II\nSample track III' : '',
      JSON.stringify([`/assets/sleeve-${cover}.webp`, ...(index === 0 ? ['/assets/sleeve-4.webp'] : [])]), index * 86400]);
    const memberships = groups.split(',').map(category => statement(db,
      'INSERT OR IGNORE INTO product_categories (product_id, category_slug) SELECT id, ? FROM products WHERE slug = ?',
      [category, slug]));
    return [product, ...memberships];
  });
  await db.batch([...artists, ...products]);
}
