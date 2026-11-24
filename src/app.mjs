import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { getCookie, setCookie } from 'hono/cookie';
import { BRAND, shopSettings } from './config.mjs';
import { all, first, run } from './data.mjs';
import admin from './admin.mjs';
import {
  artists, artistBySlug, artistProducts, cartFrom, cartItems, catalogue, catalogueFilters,
  categories, changeCart, getCategory, getProduct, homeProducts, labelReleases, relatedArtists, saveCart,
} from './shop.mjs';
import {
  accountPage, artistDirectory, artistPage, cartPage, contactPage, discography, home,
  information, message, orderPage, productPage, quickView, store,
} from './views.mjs';
import { beginCheckout, CheckoutError, orderByToken, orderItems, reconcileSession, stripeClient, stripeWebhook } from './checkout.mjs';
import { clearSession, emailAddress, hashPassword, passwordMatches, randomHex, rateAllowed, redirectPath, sameOrigin, session, setSession } from './security.mjs';

const app = new Hono();
const attemptPattern = /^[a-f0-9]{40}$/;
const tokenPattern = /^[a-f0-9]{64}$/;

app.use('*', async (c, next) => {
  c.set('shop', shopSettings(c.env, c.req.url));
  c.set('cart', cartFrom(c));
  c.header('Cache-Control', 'private, no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  c.header('Content-Security-Policy', [
    "default-src 'self'", "base-uri 'none'", "object-src 'none'", "frame-ancestors 'self'",
    "img-src 'self' https:", 'frame-src https://bandcamp.com', "form-action 'self' https://checkout.stripe.com",
  ].join('; '));
  if (c.env.PUBLIC_STORE !== 'true') c.header('X-Robots-Tag', 'noindex, nofollow');
  await next();
});

app.use('*', bodyLimit({ maxSize: 256 * 1024 }));
app.use('*', async (c, next) => {
  if (c.req.method === 'POST' && c.req.path !== '/webhooks/stripe' && !sameOrigin(c)) {
    return c.text('This form must be submitted from the store.', 403);
  }
  await next();
});

app.get('/health', c => c.json({ status: 'ok' }));
app.get('/robots.txt', c => {
  if (c.env.PUBLIC_STORE !== 'true') return c.text('User-agent: *\nDisallow: /\n');
  const origin = c.get('shop').origin;
  return c.text(`User-agent: *\nDisallow: /admin\nDisallow: /account\nDisallow: /cart\nDisallow: /orders\n${origin ? `Sitemap: ${origin}/sitemap.xml\n` : ''}`);
});
app.get('/sitemap.xml', async c => {
  const origin = c.get('shop').origin;
  if (!origin || c.env.PUBLIC_STORE !== 'true') return c.notFound();
  const [groups, products, performers] = await Promise.all([
    categories(c.env.DB),
    all(c.env.DB, 'SELECT slug FROM products WHERE active = 1 AND sample = 0'),
    all(c.env.DB, 'SELECT slug FROM artists WHERE sample = 0'),
  ]);
  const paths = ['/', '/store', '/about', '/artists', '/discography', '/news', '/shipping', '/contact', '/privacy', '/terms',
    ...groups.map(group => `/store/${group.slug}`),
    ...products.map(product => `/products/${product.slug}`), ...performers.map(artist => `/artists/${artist.slug}`)];
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}</urlset>`,
    200, { 'Content-Type': 'application/xml; charset=utf-8' });
});

app.get('/', async c => {
  const [arrivals, featured] = await Promise.all([homeProducts(c.env.DB, 4), homeProducts(c.env.DB, 2, true)]);
  return c.html(home(c, arrivals, featured));
});

app.get('/store/:slug?', async c => {
  const db = c.env.DB;
  const group = await getCategory(db, c.req.param('slug') ?? 'all-releases');
  if (!group) return c.notFound();
  const filters = catalogueFilters(c.req.query());
  const [groups, results] = await Promise.all([
    categories(db), catalogue(db, group, filters.q, filters.genre, filters.available, filters.sort, filters.page),
  ]);
  return c.html(store(c, group, groups, filters, results));
});

app.get('/products/:slug', async c => {
  const item = await getProduct(c.env.DB, c.req.param('slug'));
  return item ? c.html(productPage(c, item)) : c.notFound();
});
app.get('/products/:slug/quick', async c => {
  const item = await getProduct(c.env.DB, c.req.param('slug'));
  return item ? c.html(quickView(c, item)) : c.notFound();
});

app.get('/artists', async c => c.html(artistDirectory(c, await artists(c.env.DB))));
app.get('/artists/:slug', async c => {
  const artist = await artistBySlug(c.env.DB, c.req.param('slug'));
  if (!artist) return c.notFound();
  const products = await artistProducts(c.env.DB, artist.id);
  const related = await relatedArtists(c.env.DB, artist.id, products[0]?.genre);
  return c.html(artistPage(c, artist, products, related));
});
app.get('/discography', async c => c.html(discography(c, await labelReleases(c.env.DB, BRAND))));

for (const route of ['about', 'news', 'shipping', 'privacy', 'terms']) {
  app.get(`/${route}`, c => c.html(information(c, route)));
}
app.get('/contact', c => c.html(contactPage(c)));
app.post('/contact', async c => {
  const form = await c.req.parseBody();
  const name = String(form.name ?? '').trim();
  const email = emailAddress(form.email);
  const text = String(form.message ?? '').trim();
  if (!name || name.length > 120 || !email || !text || text.length > 3000) {
    return c.html(contactPage(c, 'Enter your name, a valid email address and a message.'), 400);
  }
  if (!await rateAllowed(c.env.DB, 'contact', email, 4)) return c.html(contactPage(c, 'Try again in a few minutes.'), 429);
  await run(c.env.DB, 'INSERT INTO messages (name, email, message) VALUES (?, ?, ?)', [name, email, text]);
  return c.redirect('/contact?sent=1', 303);
});

app.post('/newsletter', async c => {
  const form = await c.req.parseBody();
  const email = emailAddress(form.email);
  if (!email) return c.redirect('/?newsletter=error#newsletter', 303);
  if (await rateAllowed(c.env.DB, 'subscribe', email, 3)) {
    await run(c.env.DB, 'INSERT OR IGNORE INTO subscribers (email) VALUES (?)', [email]);
  }
  return c.redirect('/?newsletter=ok#newsletter', 303);
});

app.get('/cart', async c => {
  const items = await cartItems(c.env.DB, c.get('cart'));
  const settings = c.get('shop');
  const country = (c.req.query('country') ?? '').toUpperCase();
  let attempt = getCookie(c, 'akr_checkout');
  let order = null;
  if (settings.checkout && items.length) {
    if (attemptPattern.test(attempt ?? '')) order = await first(c.env.DB, 'SELECT * FROM orders WHERE id = ?', [attempt]);
    if (!attemptPattern.test(attempt ?? '') || order?.status === 'expired') {
      attempt = randomHex(20);
      order = null;
      setCookie(c, 'akr_checkout', attempt, { path: '/', sameSite: 'Lax', httpOnly: true, secure: settings.secure, maxAge: 60 * 60 * 24 });
    }
    if (order?.status === 'paid' || order?.status === 'shipped') return c.redirect(`/orders/${order.access_token}`, 303);
  }
  return c.html(cartPage(c, items, Object.hasOwn(settings.rates, country) ? country : '', attempt, order));
});

app.post('/cart/add', async c => {
  const form = await c.req.parseBody();
  const item = await getProduct(c.env.DB, String(form.slug ?? ''));
  const cart = c.get('cart');
  const error = item ? changeCart(cart, item, Number(form.quantity), true) : 'This item is no longer available.';
  const json = c.req.header('accept')?.includes('application/json');
  if (error) return json ? c.json({ error }, 409) : message(c, 'Unable to add item', error, 409);
  saveCart(c, cart);
  if (json) return c.json({ count: [...cart.values()].reduce((sum, count) => sum + count, 0), message: 'Added to your cart.' });
  const next = new URL(redirectPath(form.next), c.req.url);
  next.searchParams.set('added', '1');
  return c.redirect(next.pathname + next.search, 303);
});

app.post('/cart/update', async c => {
  const form = await c.req.parseBody();
  const id = Number(form.id);
  const cart = c.get('cart');
  if (!cart.has(id)) return c.redirect('/cart', 303);
  const remove = form.remove === '1';
  const item = remove ? { id } : await first(c.env.DB, 'SELECT id, stock, active FROM products WHERE id = ?', [id]);
  const error = item ? changeCart(cart, item, remove ? 0 : Number(form.quantity)) : 'Remove this unavailable item from your cart.';
  if (error) return message(c, 'Unable to update item', error, 409, '/cart', 'Back to cart');
  saveCart(c, cart);
  return c.redirect('/cart', 303);
});

app.post('/checkout', async c => {
  const form = await c.req.parseBody();
  const { attempt, country } = form;
  if (!attemptPattern.test(attempt ?? '') || attempt !== getCookie(c, 'akr_checkout')) {
    return message(c, 'Checkout session expired', 'Return to your cart to start a new checkout.', 409, '/cart', 'Back to cart');
  }
  const [customer, items] = await Promise.all([session(c), cartItems(c.env.DB, c.get('cart'))]);
  try {
    return c.redirect(await beginCheckout(c.env, c.get('shop'), attempt, customer, country, items), 303);
  } catch (error) {
    if (error instanceof CheckoutError) return message(c, 'Unable to open checkout', error.message, 409, '/cart', 'Back to cart');
    throw error;
  }
});

app.get('/orders/:token', async c => {
  const token = c.req.param('token');
  if (!tokenPattern.test(token)) return c.notFound();
  let order = await orderByToken(c.env.DB, token);
  if (!order) return c.notFound();
  if (order.status === 'pending' && order.stripe_session && c.env.STRIPE_SECRET_KEY) {
    try {
      await reconcileSession(c.env.DB, await stripeClient(c.env).checkout.sessions.retrieve(order.stripe_session));
      order = await orderByToken(c.env.DB, token);
    } catch (error) {
      console.warn('Order reconciliation deferred:', error.name);
    }
  }
  const paid = order.status === 'paid' || order.status === 'shipped';
  if (paid && getCookie(c, 'akr_checkout') === order.id) saveCart(c, new Map());
  c.header('Referrer-Policy', 'no-referrer');
  return c.html(orderPage(c, order, await orderItems(c.env.DB, order.id)));
});
app.post('/webhooks/stripe', stripeWebhook);

app.get('/account', async c => {
  const customer = await session(c);
  const orders = customer ? await all(c.env.DB, 'SELECT * FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 100', [customer.account_id]) : [];
  return c.html(accountPage(c, customer, orders));
});

app.post('/account/:action', async c => {
  const action = c.req.param('action');
  if (action === 'logout') {
    await clearSession(c, 'customer');
    return c.redirect('/account', 303);
  }
  if (!['login', 'register'].includes(action)) return c.notFound();
  const register = action === 'register';
  const reply = (error, status) => c.html(accountPage(c, null, [], error, register), status);
  const form = await c.req.parseBody();
  const email = emailAddress(form.email);
  const password = typeof form.password === 'string' ? form.password : '';
  if (!email || !password || password.length > 128 || register && password.length < 12) {
    return reply(register ? 'Enter a valid email and a password of at least 12 characters.' : 'Enter your email and password.', 400);
  }
  if (!await rateAllowed(c.env.DB, 'customer-auth', email, 8) || !await rateAllowed(c.env.DB, 'customer-auth-total', 'store', 150)) {
    return reply('Too many attempts. Try again in a few minutes.', 429);
  }
  if (register) {
    const hash = await hashPassword(password);
    const account = await first(c.env.DB, 'INSERT OR IGNORE INTO accounts (email, password_hash) VALUES (?, ?) RETURNING id', [email, hash]);
    if (!account) return reply('This account couldn’t be created. Try signing in.', 409);
    await setSession(c, 'customer', account.id);
  } else {
    const account = await first(c.env.DB, 'SELECT id, password_hash FROM accounts WHERE email = ?', [email]);
    if (!await passwordMatches(password, account?.password_hash)) return reply('Email or password is incorrect.', 401);
    await setSession(c, 'customer', account.id);
  }
  return c.redirect('/account', 303);
});

app.route('/admin', admin);

app.notFound(c => message(c, 'Page not found', 'The page or release you requested is unavailable.', 404));
app.onError((error, c) => {
  console.error('Store request failed:', error.name, c.req.method, c.req.routePath);
  return message(c, 'Something went wrong', 'Try again in a moment.', 500);
});

export default app;
