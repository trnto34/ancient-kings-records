import Stripe from 'stripe';
import { all, first, run, statement } from './data.mjs';
import { cartTotal } from './shop.mjs';
import { now, randomHex } from './security.mjs';

const orderById = (db, id) => first(db, 'SELECT * FROM orders WHERE id = ?', [id]);
export const orderByToken = (db, token) => first(db, 'SELECT * FROM orders WHERE access_token = ?', [token]);
export const orderItems = (db, id) => all(db, 'SELECT * FROM order_items WHERE order_id = ? ORDER BY product_id', [id]);

export class CheckoutError extends Error {}

export function stripeClient(env) {
  return new Stripe(env.STRIPE_SECRET_KEY, { httpClient: Stripe.createFetchHttpClient(), maxNetworkRetries: 2, timeout: 10_000 });
}

async function reserveOrder(db, id, accountId, items, country, settings) {
  if (!items.length || items.some(item => item.missing || item.sample || item.quantity > item.stock)) {
    throw new CheckoutError('Review the availability of the items in your cart.');
  }

  const order = statement(db, `
    INSERT INTO orders (id, access_token, account_id, subtotal_cents, shipping_cents, currency, country, expires_at, test)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [id, randomHex(), accountId, cartTotal(items), settings.rates[country], settings.currency, country,
    now() + 35 * 60, Number(settings.test)]);
  const lines = items.map(item => statement(db, `
    INSERT INTO order_items (order_id, product_id, title, quantity, unit_cents) VALUES (?, ?, ?, ?, ?)`,
  [id, item.id, item.artist ? `${item.artist} · ${item.title}` : item.title, item.quantity, item.price_cents]));
  try {
    await db.batch([order, ...lines]);
  } catch (error) {
    const existing = await orderById(db, id);
    if (existing) return existing;
    if (String(error.message).includes('inventory_changed')) {
      throw new CheckoutError('Stock or prices changed. Review your cart and try again.');
    }
    throw error;
  }
  return await orderById(db, id);
}

export async function reconcileSession(db, session) {
  const id = session.metadata?.order_id;
  if (!id || !/^[a-f0-9]{40}$/.test(id)) return;

  const order = await orderById(db, id);
  if (!order || (order.stripe_session && order.stripe_session !== session.id) || session.livemode !== !Boolean(order.test)) return;

  if (session.status === 'expired' && session.payment_status === 'unpaid') {
    await run(db, "UPDATE orders SET status = 'expired', stripe_session = ? WHERE id = ? AND status = 'pending'", [session.id, id]);
    return;
  }

  if (session.status !== 'complete' || !['paid', 'no_payment_required'].includes(session.payment_status)) return;
  const validTotal = session.currency === order.currency.toLowerCase() &&
    session.amount_subtotal === order.subtotal_cents &&
    session.total_details?.amount_shipping === order.shipping_cents &&
    session.amount_total === order.subtotal_cents + order.shipping_cents;
  if (!validTotal) throw new Error('Stripe payment totals do not match the order.');

  const shipping = session.collected_information?.shipping_details ?? session.shipping_details;
  await run(db, `
    UPDATE orders SET status = 'paid', stripe_session = ?, email = ?, shipping_details = ?, paid_total_cents = ?
    WHERE id = ? AND status = 'pending'`, [
    session.id, session.customer_details?.email ?? session.customer_email ?? null,
    shipping ? JSON.stringify(shipping) : null, session.amount_total, id,
  ]);
}

export async function beginCheckout(env, settings, attempt, customer, country, items) {
  const db = env.DB;
  if (!settings.checkout) throw new CheckoutError('Checkout is currently unavailable.');
  if (!Object.hasOwn(settings.rates, country)) throw new CheckoutError('Choose a shipping destination.');

  const existing = await orderById(db, attempt);
  const order = existing ?? await reserveOrder(db, attempt, customer?.account_id ?? null, items, country, settings);
  const confirmationUrl = `${settings.origin}/orders/${order.access_token}`;
  if (order.status === 'expired') throw new CheckoutError('That checkout expired. Start again from your cart.');
  if (order.status !== 'pending') return confirmationUrl;
  if (order.country !== country) throw new CheckoutError('Resume checkout with the original shipping destination.');

  const stripe = stripeClient(env);
  if (order.stripe_session) {
    const session = await stripe.checkout.sessions.retrieve(order.stripe_session);
    if (session.status === 'open' && session.url) return session.url;
    await reconcileSession(db, session);
    return confirmationUrl;
  }

  const lines = await orderItems(db, order.id);
  const currency = order.currency.toLowerCase();
  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      expires_at: order.expires_at,
      success_url: `${confirmationUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${settings.origin}/cart?cancelled=1&country=${encodeURIComponent(country)}`,
      client_reference_id: order.id,
      metadata: { order_id: order.id },
      shipping_address_collection: { allowed_countries: [country] },
      shipping_options: [{
        shipping_rate_data: {
          type: 'fixed_amount',
          display_name: 'Standard shipping',
          fixed_amount: { amount: order.shipping_cents, currency },
        },
      }],
      line_items: lines.map(line => ({
        price_data: { currency, product_data: { name: line.title }, unit_amount: line.unit_cents },
        quantity: line.quantity,
      })),
    }, { idempotencyKey: `ancient-king-order-${order.id}` });
  } catch (error) {
    if ((error.statusCode === 400 && error.code !== 'idempotency_key_in_use') || [401, 403].includes(error.statusCode)) {
      await run(db, "UPDATE orders SET status = 'expired' WHERE id = ? AND status = 'pending' AND stripe_session IS NULL", [order.id]);
    }
    throw new CheckoutError('Stripe could not open checkout. Return to your cart to try again.');
  }

  await run(db, 'UPDATE orders SET stripe_session = ? WHERE id = ? AND stripe_session IS NULL', [session.id, order.id]);
  return session.url ?? confirmationUrl;
}

export async function stripeWebhook(c) {
  const signature = c.req.header('stripe-signature');
  if (!signature || !c.env.STRIPE_WEBHOOK_SECRET || !c.env.STRIPE_SECRET_KEY) return c.text('Webhook unavailable', 400);
  const stripe = stripeClient(c.env);
  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(await c.req.text(), signature, c.env.STRIPE_WEBHOOK_SECRET,
      undefined, Stripe.createSubtleCryptoProvider());
  } catch {
    return c.text('Invalid webhook signature', 400);
  }

  if (['checkout.session.completed', 'checkout.session.expired'].includes(event.type)) {
    await reconcileSession(c.env.DB, event.data.object);
  }
  return c.json({ received: true });
}
