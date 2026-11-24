import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { all, first } from './data.mjs';
import { SAMPLE_ART } from './config.mjs';

const productsFrom = `FROM products p LEFT JOIN artists a ON a.id = p.artist_id
  LEFT JOIN bandcamp_items b ON b.product_id = p.id LEFT JOIN products parent ON parent.id = p.parent_id`;
export const availableStock = `COALESCE((SELECT SUM(CASE WHEN v.active = 1 THEN v.stock ELSE 0 END)
  FROM products v WHERE v.parent_id = p.id GROUP BY v.parent_id), p.stock)`;
const productsSelect = `SELECT p.*, a.name AS artist, a.slug AS artist_slug,
  b.kind AS bandcamp_kind, b.thumbnail AS bandcamp_thumbnail, b.option_name AS bandcamp_option_name,
  ${availableStock} AS available_stock, EXISTS (SELECT 1 FROM products v WHERE v.parent_id = p.id) AS has_variants,
  COALESCE(parent.slug, p.slug) AS listing_slug, COALESCE(parent.images, p.images) AS listing_images ${productsFrom}`;
const pageSize = 12;
const maxCartLines = 30;
export const maxQuantity = 20;

const sorts = {
  newest: 'p.created_at DESC, p.id DESC',
  oldest: 'p.created_at ASC, p.id ASC',
  'price-asc': "(b.kind IS 'digital' OR p.format = 'Shipping add-on') ASC, p.price_cents ASC, p.id DESC",
  'price-desc': "(b.kind IS 'digital' OR p.format = 'Shipping add-on') ASC, p.price_cents DESC, p.id DESC",
};

export const categories = db => all(db, 'SELECT * FROM categories ORDER BY position, name');
export const getCategory = (db, slug) => first(db, 'SELECT * FROM categories WHERE slug = ?', [slug]);
export const productVariants = (db, id) => all(db, `
  SELECT id, slug, variant_label, stock, active, revision FROM products WHERE parent_id = ? ORDER BY id`, [id]);

export async function getProduct(db, slug) {
  const item = await first(db, `${productsSelect} WHERE p.active = 1 AND p.parent_id IS NULL AND p.slug = ?`, [slug]);
  if (item?.has_variants) item.variants = await productVariants(db, item.id);
  return item;
}

export function canPurchase(item) {
  return item.bandcamp_kind !== 'digital' && item.format !== 'Shipping add-on';
}

export async function purchaseProduct(db, item, option) {
  if (!item.has_variants) return item;
  if (typeof option !== 'string' || !option) return null;
  return await first(db, `${productsSelect} WHERE p.slug = ? AND p.parent_id = ? AND parent.active = 1`,
    [option, item.id]);
}

export const homeProducts = (db, limit, featured = false) =>
  all(db, `${productsSelect} WHERE p.active = 1 AND p.parent_id IS NULL ${featured ? 'AND p.featured = 1' :
    `AND (b.kind IS NULL OR (b.kind = 'physical' AND ${availableStock} > 0 AND p.format <> 'Shipping add-on'))`}
    ORDER BY p.created_at DESC, p.id DESC LIMIT ?`, [limit]);

export function productImages(product) {
  try {
    const images = JSON.parse(product.listing_images ?? product.images);
    if (images.length) return images;
  } catch {
    // Records without artwork use the default sleeve.
  }
  return [SAMPLE_ART];
}

export async function catalogue(db, category, q, genre, available, sort, page) {
  const where = ['p.active = 1', 'p.parent_id IS NULL'];
  const params = [];
  if (category.rule === 'recent') where.push('p.created_at >= unixepoch() - 7776000');
  if (category.rule === 'sale') where.push('p.list_cents > p.price_cents');
  if (category.rule === 'manual') {
    where.push('EXISTS (SELECT 1 FROM product_categories pc WHERE pc.product_id = p.id AND pc.category_slug = ?)');
    params.push(category.slug);
  }
  if (q) {
    const term = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
    where.push("(p.title LIKE ? ESCAPE '\\' OR a.name LIKE ? ESCAPE '\\' OR p.format LIKE ? ESCAPE '\\')");
    params.push(term, term, term);
  }
  if (genre) {
    where.push('p.genre = ?');
    params.push(genre);
  }
  if (available) where.push(`${availableStock} > 0 AND b.kind IS NOT 'digital' AND p.format <> 'Shipping add-on'`);

  const filter = `WHERE ${where.join(' AND ')}`;
  const { total } = await first(db, `SELECT count(*) AS total ${productsFrom} ${filter}`, params);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(page, 1), pages);
  const items = await all(db, `${productsSelect} ${filter} ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`,
    [...params, pageSize, (current - 1) * pageSize]);
  return { items, total, pages, current };
}

export function catalogueFilters(query) {
  const page = Number.parseInt(query.page, 10);
  return {
    q: (query.q ?? '').trim().slice(0, 120),
    genre: (query.genre ?? '').trim().slice(0, 60),
    available: query.available === '1',
    sort: Object.hasOwn(sorts, query.sort) ? query.sort : 'newest',
    page: Number.isSafeInteger(page) ? page : 1,
  };
}

const visibleArtist = `(a.sample = 0 OR EXISTS
  (SELECT 1 FROM products p WHERE p.artist_id = a.id AND p.active = 1))`;
export const artists = db => all(db, `SELECT a.* FROM artists a WHERE ${visibleArtist} ORDER BY a.name`);
export const artistBySlug = (db, slug) => first(db, `SELECT a.* FROM artists a WHERE ${visibleArtist} AND a.slug = ?`, [slug]);
export const artistProducts = (db, artistId) =>
  all(db, `${productsSelect} WHERE p.active = 1 AND p.parent_id IS NULL AND p.artist_id = ? ORDER BY p.release_date DESC, p.title`, [artistId]);
export const labelReleases = (db, label) =>
  all(db, `${productsSelect} WHERE p.active = 1 AND p.parent_id IS NULL AND p.label = ? AND p.release_date <> '' AND (b.kind IS NULL OR b.kind = 'digital')
    ORDER BY p.release_date DESC, p.title`, [label]);
export const relatedArtists = (db, artistId, genre) => genre ? all(db, `
  SELECT DISTINCT a.* FROM artists a JOIN products p ON p.artist_id = a.id
  WHERE p.active = 1 AND p.genre = ? AND a.id <> ? ORDER BY a.name LIMIT 4`, [genre, artistId]) : [];

export function cartFrom(c) {
  try {
    const pairs = JSON.parse(getCookie(c, 'akr_cart') ?? '[]');
    return new Map(pairs.slice(0, maxCartLines).filter(([id, qty]) =>
      Number.isSafeInteger(id) && id > 0 && Number.isSafeInteger(qty) && qty > 0 && qty <= maxQuantity));
  } catch {
    return new Map();
  }
}

export function saveCart(c, cart) {
  const settings = c.get('shop');
  setCookie(c, 'akr_cart', JSON.stringify([...cart]), {
    path: '/', sameSite: 'Lax', httpOnly: true, maxAge: 60 * 60 * 24 * 30, secure: settings.secure,
  });
  deleteCookie(c, 'akr_checkout', { path: '/', secure: settings.secure });
  c.set('cart', cart);
}

export async function cartItems(db, cart) {
  if (!cart.size) return [];
  const items = await all(db, `${productsSelect} WHERE p.active = 1 AND (p.parent_id IS NULL OR parent.active = 1) AND p.id IN (${[...cart].map(() => '?').join(',')})`, [...cart.keys()]);
  const byId = new Map(items.map(item => [item.id, item]));
  return [...cart].map(([id, quantity]) => ({
    ...(byId.get(id) ?? { id, missing: true, title: 'Unavailable item', stock: 0, price_cents: 0 }),
    quantity,
  }));
}

export function cartTotal(items) {
  return items.reduce((total, item) => total + item.price_cents * item.quantity, 0);
}

export function changeCart(cart, product, count, add = false) {
  if (count === 0 && !add) {
    cart.delete(product.id);
    return '';
  }
  if (!canPurchase(product) || product.has_variants) return 'This listing is unavailable for purchase.';
  if (!Number.isSafeInteger(count) || count < 1 || count > maxQuantity) return 'Choose a valid quantity.';
  if (!product.active || product.stock < 1) return 'This item is out of stock.';
  const quantity = add ? (cart.get(product.id) ?? 0) + count : count;
  if (quantity > Math.min(product.stock, maxQuantity)) return 'That quantity is unavailable.';
  if (!cart.has(product.id) && cart.size >= maxCartLines) return 'Your cart is full.';
  cart.set(product.id, quantity);
  return '';
}
