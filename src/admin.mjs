import { Hono } from 'hono';
import { html } from 'hono/html';
import { BRAND, GENRES, cleanUrl, dateLabel, money } from './config.mjs';
import { all, first, run, statement } from './data.mjs';
import { adminKeyMatches, clearSession, rateAllowed, session, setSession } from './security.mjs';
import { categories } from './shop.mjs';
import { breadcrumbs, layout, message } from './views.mjs';
import { orderItems } from './checkout.mjs';

const admin = new Hono();
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const idPattern = /^[1-9]\d{0,12}$/;
const links = [['', 'Overview'], ['/products', 'Products'], ['/categories', 'Categories'], ['/artists', 'Artists'],
  ['/orders', 'Orders'], ['/messages', 'Messages'], ['/subscribers', 'Subscribers']];

function adminPage(c, title, body, status = 200, authenticated = true) {
  return c.html(layout(c, { title, noindex: true }, html`<div class="shell page-spaced">
    ${breadcrumbs(['/admin', 'Admin'], [null, title])}<h1>${title}</h1>
    ${authenticated ? html`<div class="admin-toolbar"><nav aria-label="Administration">${links.map(([href, label]) => html`<a href="/admin${href}">${label}</a>`)}</nav>
      <form method="post" action="/admin/logout"><button class="button button-outline">Sign out</button></form></div>` : ''}
    ${body}</div>`), status);
}

function loginPage(c, error = '', status = 200) {
  const enabled = (c.env.ADMIN_ACCESS_KEY ?? '').length >= 24;
  return adminPage(c, 'Store administration', enabled ? html`<form method="post" class="stacked-form narrow">
    ${error ? html`<p class="error-text" role="alert">${error}</p>` : ''}
    <label>Admin access key<input name="key" type="password" autocomplete="current-password" required maxlength="256"></label>
    <button class="button button-primary">Sign in</button>
  </form>` : html`<p>Administration access is configured by the store operator.</p>`, status, false);
}

admin.get('/login', c => loginPage(c));
admin.post('/login', async c => {
  const form = await c.req.parseBody();
  if (!await rateAllowed(c.env.DB, 'admin-login', 'store', 12)) return loginPage(c, 'Too many attempts. Try again in a few minutes.', 429);
  if (!await adminKeyMatches(String(form.key ?? ''), c.env.ADMIN_ACCESS_KEY)) return loginPage(c, 'Access key not recognized.', 401);
  await setSession(c, 'admin');
  return c.redirect('/admin', 303);
});

admin.use('*', async (c, next) => {
  if (!(c.env.ADMIN_ACCESS_KEY?.length >= 24) || !await session(c, 'admin')) return c.redirect('/admin/login', 303);
  await next();
});

admin.post('/logout', async c => {
  await clearSession(c, 'admin');
  return c.redirect('/admin/login', 303);
});

admin.get('/', async c => {
  const counts = await first(c.env.DB, `SELECT
    (SELECT count(*) FROM products) AS products,
    (SELECT count(*) FROM products WHERE active = 1 AND stock = 0) AS sold_out,
    (SELECT count(*) FROM orders WHERE status = 'paid') AS unshipped,
    (SELECT count(*) FROM subscribers) AS subscribers`);
  return adminPage(c, 'Store administration', html`<dl class="admin-stats">
    ${[['Catalogue products', 'products'], ['Sold out', 'sold_out'], ['Orders awaiting shipment', 'unshipped'], ['Release notices subscribers', 'subscribers']]
      .map(([label, key]) => html`<div><dt>${label}</dt><dd>${counts[key]}</dd></div>`)}</dl>
    <div class="actions"><a class="button button-primary" href="/admin/products/new">Add a product</a><a class="button button-outline" href="/admin/categories">Manage categories</a></div>`);
});

const table = (headers, rows) => html`<div class="table-wrap"><table><thead><tr>${headers.map(name => html`<th scope="col">${name}</th>`)}</tr></thead>
  <tbody>${rows.map(row => html`<tr>${row.map(cell => html`<td>${cell}</td>`)}</tr>`)}</tbody></table></div>`;

admin.get('/products', async c => {
  const products = await all(c.env.DB, 'SELECT * FROM products ORDER BY created_at DESC, id DESC');
  return adminPage(c, 'Products & inventory', html`<p><a class="button button-primary" href="/admin/products/new">Add a product</a></p>
    ${table(['Product', 'Format', 'Price', 'Available stock', 'Listing'], products.map(item => [
      html`<a href="/admin/products/${item.id}">${item.title}</a>`, item.format, money(item.price_cents, c.get('shop').currency),
      item.stock, `${item.active ? 'Published' : 'Draft'}${item.sample ? ' · Sample' : ''}`,
    ]))}`);
});

function field(label, name, value, requirements = {}) {
  const { required = false, type = 'text', max = 180, min, step } = requirements;
  return html`<label>${label}<input name="${name}" type="${type}" value="${value ?? ''}" maxlength="${max}"
    ${min !== undefined ? html`min="${min}"` : ''} ${step !== undefined ? html`step="${step}"` : ''} ${required ? 'required' : ''}></label>`;
}
const box = (label, name, checked) => html`<label class="checkbox"><input type="checkbox" name="${name}" value="1" ${checked ? 'checked' : ''}>${label}</label>`;
const area = (label, name, value, rows, max) => html`<label>${label}<textarea name="${name}" rows="${rows}" maxlength="${max}">${value ?? ''}</textarea></label>`;
const errorBanner = error => error ? html`<p class="form-feedback error-text" role="alert">${error}</p>` : '';

async function productForm(c, id, item, chosen, error = '') {
  const [groups, artists] = await Promise.all([categories(c.env.DB),
    all(c.env.DB, 'SELECT id, name FROM artists ORDER BY name')]);
  const title = id === 'new' ? 'Add a product' : 'Edit product';
  return adminPage(c, title, html`${errorBanner(error)}
    <form method="post" action="/admin/products/${id}" class="stacked-form admin-form">
      ${id === 'new' ? '' : html`<input type="hidden" name="revision" value="${item.revision}">`}
      <div class="field-grid">
        ${field('Title', 'title', item.title, { required: true })}
        ${field('URL slug', 'slug', item.slug, { required: true })}
        <label>Artist<select name="artist_id"><option value="">No associated artist</option>${artists.map(artist =>
          html`<option value="${artist.id}" ${Number(item.artist_id) === artist.id ? 'selected' : ''}>${artist.name}</option>`)}</select></label>
        ${field('Format', 'format', item.format, { required: true, max: 60 })}
        <label>Genre<select name="genre"><option value="">Unspecified</option>${GENRES.map(genre =>
          html`<option ${item.genre === genre ? 'selected' : ''}>${genre}</option>`)}</select></label>
        ${field('Label', 'label', item.label ?? BRAND)}
        ${field('Release date', 'release_date', item.release_date, { type: 'date' })}
        ${field('Catalogue number', 'catalogue_number', item.catalogue_number)}
        ${field(`Price (${c.get('shop').currency})`, 'price', item.price, { type: 'number', required: true, min: 0, step: '0.01' })}
        ${field('Original price (optional)', 'list_price', item.list_price, { type: 'number', min: 0, step: '0.01' })}
        ${field('Available stock', 'stock', item.stock ?? 0, { type: 'number', required: true, min: 0 })}
        ${field('Bandcamp album ID (optional)', 'bandcamp_album', item.bandcamp_album, { max: 16 })}
      </div>
      ${area('Artwork URLs (one per line)', 'artwork', item.artwork, 3, 4000)}
      ${area('Description', 'description', item.description, 5, 5000)}
      ${area('Tracklist (one track per line)', 'tracklist', item.tracklist, 5, 4000)}
      <fieldset><legend>Catalogue categories</legend><div class="check-grid">${groups.filter(group => group.rule === 'manual').map(group =>
        html`<label class="checkbox"><input type="checkbox" name="categories" value="${group.slug}" ${chosen.includes(group.slug) ? 'checked' : ''}>${group.name}</label>`)}</div></fieldset>
      <fieldset><legend>Listing options</legend><div class="check-grid">${box('Published', 'active', item.active)}
        ${box('Sample listing', 'sample', item.sample)}${box('Featured on the homepage', 'featured', item.featured)}</div></fieldset>
      <button class="button button-primary">Save product</button>
    </form>`, error ? 400 : 200);
}

admin.get('/products/:id', async c => {
  const id = c.req.param('id');
  if (id === 'new') return productForm(c, id, {}, []);
  const item = idPattern.test(id) && await first(c.env.DB, 'SELECT * FROM products WHERE id = ?', [Number(id)]);
  if (!item) return message(c, 'Product unavailable', 'This catalogue entry could not be found.', 404, '/admin/products', 'Products');
  const groups = await all(c.env.DB, 'SELECT category_slug FROM product_categories WHERE product_id = ?', [item.id]);
  return productForm(c, id, {
    ...item, price: (item.price_cents / 100).toFixed(2),
    list_price: item.list_cents === null ? '' : (item.list_cents / 100).toFixed(2), artwork: JSON.parse(item.images).join('\n'),
  }, groups.map(group => group.category_slug));
});

admin.post('/products/:id', async c => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const existing = id !== 'new' && idPattern.test(id) && await first(db, 'SELECT * FROM products WHERE id = ?', [Number(id)]);
  if (id !== 'new' && !existing) return c.redirect('/admin/products', 303);
  const form = await c.req.parseBody({ all: true });
  const selected = [form.categories ?? []].flat();
  const item = {
    slug: text(form.slug, 100), title: text(form.title, 180), artist_id: text(form.artist_id, 14),
    format: text(form.format, 60), genre: text(form.genre, 60), label: text(form.label, 180),
    price: text(form.price, 10), list_price: text(form.list_price, 10), stock: text(form.stock, 8),
    release_date: text(form.release_date, 10), catalogue_number: text(form.catalogue_number, 180),
    description: text(form.description, 5000), tracklist: text(form.tracklist, 4000),
    revision: text(form.revision, 12),
    artwork: text(form.artwork, 4000), bandcamp_album: text(form.bandcamp_album, 16),
    active: Number(form.active === '1'), sample: Number(form.sample === '1'), featured: Number(form.featured === '1'),
  };
  const error = reason => productForm(c, id, item, selected, reason);
  const price = /^\d{1,6}(?:\.\d{1,2})?$/;
  if (!slugPattern.test(item.slug) || !item.title || !item.format) return error('Enter a title, format and a lowercase slug with hyphens.');
  if (!price.test(item.price) || item.list_price && (!price.test(item.list_price) || Number(item.list_price) <= Number(item.price))) return error('Enter valid prices. The original price must be higher than the sale price.');
  if (!/^\d{1,7}$/.test(item.stock)) return error('Enter an available stock quantity of zero or more.');
  const date = new Date(`${item.release_date}T00:00:00Z`);
  if (item.release_date && (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== item.release_date)) return error('Enter a valid release date.');
  if (item.bandcamp_album && !/^\d{1,16}$/.test(item.bandcamp_album)) return error('Enter a numeric Bandcamp album ID.');
  const artwork = item.artwork.split('\n').map(line => line.trim()).filter(Boolean);
  const images = artwork.map(cleanUrl);
  if (images.length > 8 || images.some(image => !image)) return error('Use up to eight HTTPS artwork URLs or local /assets/ paths.');
  const artistId = item.artist_id ? Number(item.artist_id) : null;
  if (artistId !== null && (!idPattern.test(item.artist_id) || !await first(db, 'SELECT id FROM artists WHERE id = ?', [artistId]))) return error('Choose an existing artist.');
  const groups = (await categories(db)).filter(group => group.rule === 'manual' && selected.includes(group.slug));
  const values = [
    item.slug, item.title, artistId, item.format, GENRES.includes(item.genre) ? item.genre : '',
    Math.round(Number(item.price) * 100), item.list_price ? Math.round(Number(item.list_price) * 100) : null, Number(item.stock),
    item.active, item.sample, item.featured, item.label, item.catalogue_number, item.release_date, item.description, item.tracklist,
    JSON.stringify(images), item.bandcamp_album,
  ];
  const columns = ['slug', 'title', 'artist_id', 'format', 'genre', 'price_cents', 'list_cents', 'stock', 'active', 'sample', 'featured',
    'label', 'catalogue_number', 'release_date', 'description', 'tracklist', 'images', 'bandcamp_album'];
  const stale = () => message(c, 'Product changed', 'Reload the product and review the current inventory before saving.', 409, `/admin/products/${id}`, 'Reload product');
  if (existing && (!/^\d+$/.test(item.revision) || Number(item.revision) !== existing.revision)) return stale();
  const save = existing ? statement(db, `UPDATE products SET ${columns.map(column => `${column} = ?`).join(', ')},
    revision = CASE WHEN revision = ? THEN revision + 1 ELSE -1 END WHERE id = ?`,
  [...values, existing.revision, existing.id]) :
    statement(db, `INSERT INTO products (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, values);

  try {
    const operations = [
      save,
      statement(db, 'DELETE FROM product_categories WHERE product_id = (SELECT id FROM products WHERE slug = ?)', [item.slug]),
      ...groups.map(group => statement(db, 'INSERT INTO product_categories SELECT id, ? FROM products WHERE slug = ?', [group.slug, item.slug])),
    ];
    await db.batch(operations);
  } catch (failure) {
    if (failure.message.includes('revision >= 0')) return stale();
    if (/unique/i.test(failure.message)) return error('A product already uses that slug.');
    throw failure;
  }
  return c.redirect('/admin/products', 303);
});

admin.get('/categories', async c => {
  const groups = await categories(c.env.DB);
  return adminPage(c, 'Catalogue categories', html`<div class="management-grid">
    ${groups.map(group => categoryForm(group))}${categoryForm({})}</div>`);
});

function categoryForm(group) {
  return html`<form method="post" class="stacked-form panel">
    <h2>${group.name || 'New category'}</h2>
    ${group.slug ? html`<input type="hidden" name="slug" value="${group.slug}">` : field('URL slug', 'slug', '', { required: true })}
    ${field('Name', 'name', group.name, { required: true })}
    ${area('Description', 'description', group.description, 2, 350)}
    ${field('Display position', 'position', group.position ?? 100, { type: 'number', min: 0, required: true })}
    <button class="button button-outline">Save category</button>
  </form>`;
}

admin.post('/categories', async c => {
  const form = await c.req.parseBody();
  const slug = text(form.slug, 100);
  const name = text(form.name, 180);
  const position = Number(form.position);
  if (!slugPattern.test(slug) || !name || !Number.isInteger(position) || position < 0 || position > 9999) {
    return message(c, 'Invalid category details', 'Enter a name, a lowercase slug and a position between 0 and 9999.', 400, '/admin/categories', 'Catalogue categories');
  }
  await run(c.env.DB, `INSERT INTO categories (slug, name, description, position) VALUES (?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description, position = excluded.position`,
  [slug, name, text(form.description, 350), position]);
  return c.redirect('/admin/categories', 303);
});

admin.get('/artists', async c => {
  const artists = await all(c.env.DB, 'SELECT * FROM artists ORDER BY name');
  return adminPage(c, 'Manage artists', html`<div class="management-grid">${artists.map(artistForm)}${artistForm({})}</div>`);
});

function artistForm(artist) {
  return html`<form method="post" class="stacked-form panel">
    <h2>${artist.name || 'New artist'}</h2>
    ${artist.slug ? html`<input type="hidden" name="slug" value="${artist.slug}">` : field('URL slug', 'slug', '', { required: true })}
    ${field('Name', 'name', artist.name, { required: true })}${area('Biography', 'bio', artist.bio, 4, 5000)}
    ${field('Artwork URL', 'artwork', artist.artwork, { max: 800 })}${field('Listening link', 'listening_url', artist.listening_url, { type: 'url', max: 800 })}
    ${box('Sample profile', 'sample', artist.sample)}<button class="button button-outline">Save artist</button>
  </form>`;
}

admin.post('/artists', async c => {
  const form = await c.req.parseBody();
  const slug = text(form.slug, 100);
  const name = text(form.name, 180);
  const artwork = cleanUrl(form.artwork);
  const listening = cleanUrl(form.listening_url);
  if (!slugPattern.test(slug) || !name || form.artwork && !artwork || form.listening_url && !listening.startsWith('https://')) {
    return message(c, 'Invalid artist details', 'Enter a name, a lowercase slug and valid artwork and listening URLs.', 400, '/admin/artists', 'Manage artists');
  }
  await run(c.env.DB, `INSERT INTO artists (slug, name, bio, artwork, listening_url, sample) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET name = excluded.name, bio = excluded.bio, artwork = excluded.artwork,
    listening_url = excluded.listening_url, sample = excluded.sample`,
  [slug, name, text(form.bio, 5000), artwork, listening, Number(form.sample === '1')]);
  return c.redirect('/admin/artists', 303);
});

admin.get('/orders', async c => {
  const rows = await all(c.env.DB, 'SELECT * FROM orders ORDER BY created_at DESC LIMIT 150');
  return adminPage(c, 'Orders', rows.length ? table(['Reference', 'Date', 'Status', 'Total'], rows.map(order => [
    html`<a href="/admin/orders/${order.id}">${order.id.slice(0, 10).toUpperCase()}</a>`,
    dateLabel(order.created_at), `${order.status}${order.test ? ' · Test' : ''}`,
    money(order.paid_total_cents ?? order.subtotal_cents + order.shipping_cents, order.currency),
  ])) : html`<p>No orders yet.</p>`);
});

admin.get('/orders/:id', async c => {
  const order = await first(c.env.DB, 'SELECT * FROM orders WHERE id = ?', [c.req.param('id')]);
  if (!order) return message(c, 'Order unavailable', 'This order could not be found.', 404, '/admin/orders', 'Orders');
  const lines = await orderItems(c.env.DB, order.id);
  const shipping = JSON.parse(order.shipping_details ?? 'null');
  return adminPage(c, `Order ${order.id.slice(0, 10).toUpperCase()}`, html`<p>${order.status}${order.test ? ' · Stripe test order' : ''}</p>
    ${table(['Item', 'Quantity', 'Unit price'], lines.map(line => [line.title, line.quantity, money(line.unit_cents, order.currency)]))}
    ${shipping || order.email ? html`<section class="panel"><h2>Delivery details</h2><p>${order.email}</p>
      <p>${[shipping?.name, shipping?.address?.line1, shipping?.address?.line2, shipping?.address?.city,
        shipping?.address?.state, shipping?.address?.postal_code, shipping?.address?.country].filter(Boolean).map(line => html`${line}<br>`)}</p></section>` : ''}
    ${order.status === 'paid' ? html`<form method="post"><button class="button button-primary">Mark as shipped</button></form>` : ''}`);
});

admin.post('/orders/:id', async c => {
  const id = c.req.param('id');
  await run(c.env.DB, "UPDATE orders SET status = 'shipped' WHERE id = ? AND status = 'paid'", [id]);
  return c.redirect(`/admin/orders/${encodeURIComponent(id)}`, 303);
});

admin.get('/messages', async c => {
  const messages = await all(c.env.DB, 'SELECT * FROM messages ORDER BY created_at DESC LIMIT 100');
  return adminPage(c, 'Contact messages', messages.length ? html`<div class="management-grid">${messages.map(item => html`
    <article class="panel"><h2>${item.name}</h2><p>${item.email} · ${dateLabel(item.created_at)}</p><p class="preserve-lines">${item.message}</p></article>`)}</div>` :
    html`<p>No messages yet.</p>`);
});

admin.get('/subscribers', async c => {
  const people = await all(c.env.DB, 'SELECT * FROM subscribers ORDER BY created_at DESC');
  return adminPage(c, 'Release notice subscribers', people.length ? table(['Email', 'Subscribed'], people.map(person =>
    [person.email, dateLabel(person.created_at)])) : html`<p>No subscribers yet.</p>`);
});

export default admin;
