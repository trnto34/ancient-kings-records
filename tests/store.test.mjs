import assert from 'node:assert/strict';
import test from 'node:test';
import Stripe from 'stripe';
import app from '../src/app.mjs';
import { seedBandcamp } from '../src/bandcamp.mjs';
import { first, run, seedCatalogue, statement } from '../src/data.mjs';
import { openDatabase } from '../src/sqlite.mjs';

const origin = 'http://localhost';
const webhookSecret = 'whsec_local_test_fixture';

async function setup(t, demo = true) {
  const DB = openDatabase(':memory:');
  t.after(() => DB.close());
  await seedCatalogue(DB, demo);
  const env = { DB, ADMIN_ACCESS_KEY: 'a-local-testing-key-with-no-production-access' };
  const request = (path, init) => app.request(origin + path, init, env);
  const post = (path, fields, cookie, extra = {}) => request(path, {
    method: 'POST',
    headers: { origin, ...(cookie ? { cookie } : {}), ...extra },
    body: new URLSearchParams(fields),
  });
  return { DB, env, request, post };
}

test('category routes, search and pagination query the catalogue', async t => {
  const { request } = await setup(t);
  const paths = ['/', '/store', '/store/double-lps', '/store/eps', '/store/shirts', '/store/sale',
    '/products/the-silent-keep/quick', '/products/the-silent-keep', '/artists/sample-artist-a',
    '/discography', '/about', '/news', '/shipping', '/privacy', '/terms', '/contact'];
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /Ancient King|Sample/);
  }
  const search = await (await request('/store?q=cassette&genre=Dungeon+synth&available=1')).text();
  assert.match(search, /The Silent Keep/);
  assert.doesNotMatch(search, /The Stone Circle/);
  const page = await (await request('/store?page=2')).text();
  assert.match(page, /Page 2 of 2/);
  const empty = await (await request('/store?q=nonexistent')).text();
  assert.match(empty, /No matching items/);
  assert.equal((await request('/store/missing')).status, 404);
});

test('cart persists in a cookie and calculates totals from current catalogue prices', async t => {
  const { DB, env, request, post } = await setup(t);
  env.SHIPPING_RATES = '{"DE":750}';
  const product = await first(DB, "SELECT id FROM products WHERE slug = 'the-silent-keep'");
  const added = await post('/cart/add', { slug: 'the-silent-keep', quantity: 2 }, null, { accept: 'application/json' });
  assert.equal(added.status, 200);
  assert.equal((await added.json()).count, 2);
  const cookie = added.headers.getSetCookie()[0].split(';')[0];
  assert.match(cookie, /^akr_cart=/);
  const cart = await request('/cart', { headers: { cookie } });
  const markup = await cart.text();
  assert.match(markup, /€24\.00/);
  assert.match(markup, /Sample items are unavailable for purchase/);
  const quoted = await (await request('/cart?country=DE', { headers: { cookie } })).text();
  assert.match(quoted, /€7\.50/);
  assert.match(quoted, /€31\.50/);
  const updated = await post('/cart/update', { id: product.id, quantity: 3 }, cookie);
  assert.equal(updated.status, 303);
  const updatedCookie = updated.headers.getSetCookie()[0].split(';')[0];
  assert.match(await (await request('/cart', { headers: { cookie: updatedCookie } })).text(), /€36\.00/);
  const removed = await post('/cart/update', { id: product.id, remove: 1 }, updatedCookie);
  const emptyCookie = removed.headers.getSetCookie()[0].split(';')[0];
  assert.match(await (await request('/cart', { headers: { cookie: emptyCookie } })).text(), /Your cart is empty/);
  assert.equal((await post('/cart/add', { slug: 'from-the-crypt', quantity: 1 }, null, { accept: 'application/json' })).status, 409);
  assert.equal((await post('/cart/add', { slug: 'the-silent-keep', quantity: 1 }, null, { origin: 'https://another.example' })).status, 403);
});

test('admin can create and update a product and stale edits preserve stock', async t => {
  const { DB, env, request, post } = await setup(t, false);
  assert.equal((await request('/admin/products')).headers.get('location'), '/admin/login');
  const signedIn = await post('/admin/login', { key: env.ADMIN_ACCESS_KEY });
  assert.equal(signedIn.headers.get('location'), '/admin');
  const cookie = signedIn.headers.getSetCookie()[0].split(';')[0];
  const details = { title: 'Integration test item', slug: 'test-listing', format: 'LP', price: '12.50', stock: 8,
    categories: 'vinyl-lps', active: 1 };
  assert.equal((await post('/admin/products/new', details, cookie)).status, 303);
  const listing = await first(DB, "SELECT id, revision FROM products WHERE slug = 'test-listing'");
  assert.match(await (await request(`/admin/products/${listing.id}`, { headers: { cookie } })).text(), /name="revision" value="0"/);
  const update = await post(`/admin/products/${listing.id}`, { ...details, revision: listing.revision, stock: 6 }, cookie);
  assert.equal(update.status, 303);
  const stale = await post(`/admin/products/${listing.id}`, { ...details, revision: listing.revision, stock: 9 }, cookie);
  assert.equal(stale.status, 409);
  assert.equal((await first(DB, 'SELECT stock FROM products WHERE id = ?', [listing.id])).stock, 6);
  assert.match(await (await request('/store/vinyl-lps')).text(), /Integration test item/);
});

test('customer registration, sign-out, and sign-in use an expiring server session', async t => {
  const { DB, request, post } = await setup(t, false);
  const email = 'listener@example.test';
  const password = 'a-test-password-with-entropy';
  const registered = await post('/account/register', { email, password });
  assert.equal(registered.status, 303);
  assert.match(registered.headers.get('set-cookie'), /HttpOnly/);
  const cookie = registered.headers.getSetCookie()[0].split(';')[0];
  assert.match(await (await request('/account', { headers: { cookie } })).text(), /listener@example\.test/);
  const stored = await first(DB, 'SELECT password_hash FROM accounts WHERE email = ?', [email]);
  assert.match(stored.password_hash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  assert.equal((await post('/account/logout', {}, cookie)).status, 303);
  assert.match(await (await request('/account', { headers: { cookie } })).text(), /Customer sign in/);
  assert.equal((await post('/account/login', { email, password })).status, 303);
});

test('only verified Stripe events confirm orders or release reserved stock once', async t => {
  const { DB, env, request } = await setup(t, false);
  env.STRIPE_SECRET_KEY = 'sk_test_webhook_verification_only';
  env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  await run(DB, "INSERT INTO products (slug, title, format, price_cents, stock, active) VALUES ('test-lp', 'Test LP', 'LP', 2500, 5, 1)");
  const product = await first(DB, "SELECT id FROM products WHERE slug = 'test-lp'");

  async function order(id, token, quantity) {
    await DB.batch([
      statement(DB, `INSERT INTO orders (id, access_token, subtotal_cents, shipping_cents, currency, country, expires_at, test)
        VALUES (?, ?, ?, 750, 'EUR', 'DE', unixepoch() + 2100, 1)`, [id, token, quantity * 2500]),
      statement(DB, "INSERT INTO order_items VALUES (?, ?, 'Test LP', ?, 2500)", [id, product.id, quantity]),
    ]);
  }

  function send(id, type, extra, signed = true) {
    const body = JSON.stringify({ type, data: { object: { id: 'cs_test_' + id, livemode: false, metadata: { order_id: id }, ...extra } } });
    const signature = signed ? Stripe.webhooks.generateTestHeaderString({ payload: body, secret: webhookSecret }) : 'invalid';
    return request('/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': signature }, body });
  }

  const expired = 'a'.repeat(40);
  const paid = 'b'.repeat(40);
  const paidToken = 'b'.repeat(64);
  await order(expired, 'a'.repeat(64), 2);
  await order(paid, paidToken, 3);
  await assert.rejects(order('c'.repeat(40), 'c'.repeat(64), 1), /inventory_changed/);
  assert.equal((await first(DB, 'SELECT count(*) AS count FROM orders')).count, 2);

  const completion = { status: 'complete', payment_status: 'paid', currency: 'eur',
    amount_subtotal: 7500, amount_total: 8250, total_details: { amount_shipping: 750 } };
  assert.equal((await send(paid, 'checkout.session.completed', completion, false)).status, 400);
  assert.match(await (await request(`/orders/${paidToken}`)).text(), /Payment pending/);
  assert.equal((await send(paid, 'checkout.session.completed', completion)).status, 200);
  assert.equal((await send(paid, 'checkout.session.completed', completion)).status, 200);
  assert.match(await (await request(`/orders/${paidToken}`)).text(), /Order confirmed/);

  const expiration = { status: 'expired', payment_status: 'unpaid' };
  assert.equal((await send(expired, 'checkout.session.expired', expiration)).status, 200);
  assert.equal((await send(expired, 'checkout.session.expired', expiration)).status, 200);
  assert.equal((await first(DB, 'SELECT stock FROM products WHERE id = ?', [product.id])).stock, 2);
});

test('physical catalogue listings buy on-site and digital previews stay out of the cart', async t => {
  const { DB, request, post } = await setup(t);
  await seedBandcamp(DB);
  await seedBandcamp(DB);
  const counts = await first(DB, `SELECT
    (SELECT count(*) FROM bandcamp_items) AS imported,
    (SELECT count(*) FROM products WHERE active = 1 AND sample = 1) AS old_samples`);
  assert.deepEqual({ ...counts }, { imported: 293, old_samples: 0 });

  const slug = 'bandcamp-item-2573136917';
  const listing = await (await request('/products/' + slug)).text();
  assert.match(listing, /Om Selvadeg/);
  assert.match(listing, /action="\/cart\/add"/);
  assert.match(listing, />Buy<\/button>/);
  assert.doesNotMatch(listing, /Buy on Bandcamp/);
  const add = await post('/cart/add', { slug, quantity: 1, next: '/cart' });
  assert.equal(add.headers.get('location'), '/cart?added=1');
  const cart = await (await request('/cart', { headers: { cookie: add.headers.getSetCookie()[0].split(';')[0] } })).text();
  assert.match(cart, /Om Selvadeg/);
  assert.match(cart, /€9\.90/);
  assert.match(cart, /Checkout is currently unavailable/);

  const digitalSlug = 'bandcamp-album-3825435833';
  const digital = await (await request('/products/' + digitalSlug)).text();
  assert.match(digital, /The Dwarven Cave/);
  assert.match(digital, /album=3825435833/);
  assert.doesNotMatch(digital, /action="\/cart\/add"/);
  assert.equal((await post('/cart/add', { slug: digitalSlug, quantity: 1 })).status, 409);
  assert.equal((await post('/cart/add', { slug: 'bandcamp-item-2509308194', quantity: 1 })).status, 409);
  assert.equal((await request('/artists/sample-artist-a')).status, 404);
});

test('size selection reserves the correct stock and reaches the Stripe checkout API', async t => {
  const { DB, env, request, post } = await setup(t, false);
  await seedBandcamp(DB);
  Object.assign(env, {
    ENABLE_CHECKOUT: 'true', SHOP_ORIGIN: origin, SHIPPING_RATES: '{"FR":500}',
    STRIPE_SECRET_KEY: 'sk_test_integration_fixture', STRIPE_WEBHOOK_SECRET: webhookSecret,
  });
  const slug = 'bandcamp-item-1810053436';
  const size = 'bandcamp-item-1810053436-option-4041771080';
  const listing = await (await request('/products/' + slug)).text();
  assert.match(listing, /<select name="variant" required>/);
  assert.equal((await post('/cart/add', { slug, quantity: 1 })).status, 409);
  assert.equal((await post('/cart/add', { slug: 'bandcamp-item-3095302623', quantity: 1, variant: size })).status, 409);
  const add = await post('/cart/add', { slug, variant: size, quantity: 2, next: '/cart' });
  const cookie = add.headers.getSetCookie()[0].split(';')[0];
  const cart = await request('/cart?country=FR', { headers: { cookie } });
  const attemptCookie = cart.headers.getSetCookie().find(value => value.startsWith('akr_checkout=')).split(';')[0];
  const attempt = attemptCookie.split('=')[1];
  const markup = await cart.text();
  assert.match(markup, /T-shirt · M/);
  assert.match(markup, /€44\.80/);
  assert.match(markup, /Continue to secure checkout/);

  const stripeCalls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    stripeCalls.push([String(url), new URLSearchParams(options.body)]);
    return Response.json({ id: 'cs_test_fixture', url: 'https://checkout.stripe.com/c/pay/cs_test_fixture' });
  });
  const checkout = await post('/checkout', { attempt, country: 'FR' }, cookie + '; ' + attemptCookie);
  assert.equal(checkout.status, 303);
  assert.equal(checkout.headers.get('location'), 'https://checkout.stripe.com/c/pay/cs_test_fixture');
  const [[url, params]] = stripeCalls;
  assert.equal(url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(params.get('line_items[0][price_data][unit_amount]'), '1990');
  assert.equal(params.get('line_items[0][quantity]'), '2');
  assert.match(params.get('line_items[0][price_data][product_data][name]'), /Solanum Logo T-Shirt \(M\)/);
  assert.equal(params.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]'), '500');

  await seedBandcamp(DB);
  assert.equal((await first(DB, 'SELECT stock FROM products WHERE slug = ?', [size])).stock, 5);
  const order = await first(DB, 'SELECT status, subtotal_cents, shipping_cents FROM orders WHERE id = ?', [attempt]);
  assert.deepEqual({ ...order }, { status: 'pending', subtotal_cents: 3980, shipping_cents: 500 });
  const line = await first(DB, 'SELECT title FROM order_items WHERE order_id = ?', [attempt]);
  assert.match(line.title, /Solanum Logo T-Shirt \(M\)/);
});
