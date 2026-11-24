# Ancient King Records

An independent label website and record store for dungeon synth, medieval and fantasy music. The demo uses the label’s branding and public Bandcamp catalogue.

The app renders pages on the server using Node.js and Hono. SQLite stores catalogue entries, stock, orders, accounts, contact messages and newsletter signups. The app serves static CSS, JavaScript, fonts and compressed artwork. There is no frontend build step.

## Run

Use Node.js 24 or later.

```sh
npm ci
npm start
```

The default address is `http://localhost:3000`. The first start creates `data/store.sqlite`. Use `npm run dev` for automatic server reloads and `npm run check` for catalogue, cart, accounts, admin and payment event checks.

Copy `.env.example` to `.env` to configure the app. Set `DATABASE_PATH` to a file on persistent storage on the host. Keep the database and secrets off GitHub. Back up the SQLite database with SQLite’s backup tools.

## Store administration

Set a random `ADMIN_ACCESS_KEY` of at least 24 characters and visit `/admin`. Use the admin to edit catalogue entries, artwork links, stock, release dates, featured items, artists and categories. It also lists orders, contact messages and release notice subscribers.

### Bandcamp demo catalogue

The demo loads `db/bandcamp.json`, a snapshot of the label’s [Bandcamp shop](https://ancientkingrec.bandcamp.com/merch) and [music catalogue](https://ancientkingrec.bandcamp.com/music) captured on 24 November 2026. It contains 232 shop listings including variants, sold-out editions and the tracked-shipping add-on, plus 61 playable music releases. The distribution index is represented by its own category.

Imported prices and availability are snapshots. Product and purchase links lead to the original Bandcamp listings. Album audio streams through the Bandcamp player, and artwork loads from Bandcamp’s image CDN. The demo leaves Bandcamp listings out of local payment and inventory. A fresh database created with `SEED_DEMO=false` starts with the standard categories and an empty catalogue for locally managed products. Use `SEED_DEMO=samples` for the original fictional catalogue fixtures.


## Stripe Checkout

Start with Stripe test mode. Set `SHOP_ORIGIN` to the store’s origin, `SHIPPING_RATES` to a JSON object of two-letter country codes and amounts in minor currency units, and configure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. The default currency is EUR. Use a two-decimal currency supported by your Stripe account.

Configure Stripe to send `checkout.session.completed` and `checkout.session.expired` to `/webhooks/stripe` and set `ENABLE_CHECKOUT=true`. Test keys produce Stripe test orders. Live processing requires live keys, a reachable HTTPS origin and the live webhook signing secret.

Checkout rechecks catalogue prices and reserves stock atomically. The hosted Stripe page collects delivery and payment details. The store confirms payment only after a verified Stripe event or a direct Stripe session lookup. Expired sessions release reserved stock. In the event of an interrupted Stripe session creation, retry checkout from the same cart to reuse the payment attempt.

## Public launch

Use a Node host with a persistent disk and HTTPS. Configure the actual catalogue, shipping rates, tax treatment, merchant details and final privacy, terms and returns copy. Set `PUBLIC_STORE=true` and `SHOP_ORIGIN` to enable search indexing and the sitemap when the store is ready.

The newsletter form saves subscribers for the label. The contact form saves inquiries in the admin. Automated mail delivery is a separate integration.
