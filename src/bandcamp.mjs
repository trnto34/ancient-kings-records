import { readFileSync } from 'node:fs';
import { BRAND } from './config.mjs';
import { samples, statement } from './data.mjs';

const snapshot = JSON.parse(readFileSync(new URL('../db/bandcamp.json', import.meta.url), 'utf8'));
export const bandcampSnapshotDate = snapshot.captured;
export function bandcampFormatArt(group) {
  return snapshot.items.find(item => item.groups.includes(group) && item.state === 'available')?.thumbnail
    ?? snapshot.items.find(item => item.groups.includes(group))?.thumbnail;
}

// Two physical editions and a recent release from the label's catalogue.
const featured = new Set(['bandcamp-item-2573136917', 'bandcamp-item-1956371679', 'bandcamp-album-3317481539']);

export async function seedBandcamp(db) {
  const commands = samples.map(([slug]) => statement(db, `
    UPDATE products SET active = 0, revision = revision + 1
    WHERE slug = ? AND sample = 1 AND active = 1`, [slug]));
  const artists = new Set();
  for (const item of snapshot.items) {
    const artistSlug = item.artist ? `bandcamp-${item.artist.normalize('NFKD').toLowerCase()
      .replace(/\p{Mark}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : '';
    if (item.artist && !artists.has(artistSlug)) {
      commands.push(statement(db, `
        INSERT OR IGNORE INTO artists (slug, name, artwork, listening_url)
        VALUES (?, ?, ?, ?)`, [artistSlug, item.artist, item.thumbnail, item.artistUrl || item.source]));
      artists.add(artistSlug);
    }

    const commercialDate = item.published || item.date;
    commands.push(
      statement(db, `
        INSERT OR IGNORE INTO products (
          slug, title, artist_id, format, genre, price_cents, stock, active, featured, label, catalogue_number,
          release_date, description, tracklist, images, bandcamp_album, created_at
        ) VALUES (?, ?, (SELECT id FROM artists WHERE slug = ?), ?, ?, ?, 0, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        item.slug, item.title, artistSlug, item.format, item.genre, item.cents ?? 0,
        Number(featured.has(item.slug)), item.groups.includes('distribution') ? '' : BRAND, item.catalogue,
        item.date, item.notes ?? '', item.tracks.join('\n'), JSON.stringify(item.images), item.albumId,
        commercialDate ? Date.parse(commercialDate) / 1000 : 0,
      ]),
      statement(db, `
        INSERT OR IGNORE INTO bandcamp_items
          (product_id, url, kind, state, price_mode, thumbnail, release_id, artist_url, option_name, options)
        SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM products WHERE slug = ?`, [
        item.source, item.kind, item.state, item.priceMode, item.thumbnail, item.albumId, item.artistUrl,
        item.optionName ?? '', JSON.stringify(item.options ?? []), item.slug,
      ]),
      ...[...new Set(item.groups)].map(group => statement(db, `
        INSERT OR IGNORE INTO product_categories (product_id, category_slug)
        SELECT id, ? FROM products WHERE slug = ?`, [group, item.slug])),
    );
  }
  await db.batch(commands);
}
