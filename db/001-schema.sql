CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 100,
  rule TEXT NOT NULL DEFAULT 'manual' CHECK (rule IN ('manual', 'all', 'recent', 'sale'))
);

CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  artwork TEXT NOT NULL DEFAULT '',
  listening_url TEXT NOT NULL DEFAULT '',
  sample INTEGER NOT NULL DEFAULT 0 CHECK (sample IN (0, 1))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist_id INTEGER REFERENCES artists(id),
  format TEXT NOT NULL,
  genre TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  list_cents INTEGER CHECK (list_cents IS NULL OR list_cents > price_cents),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  sample INTEGER NOT NULL DEFAULT 0 CHECK (sample IN (0, 1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  label TEXT NOT NULL DEFAULT '',
  catalogue_number TEXT NOT NULL DEFAULT '',
  release_date TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tracklist TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',
  bandcamp_album TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS products_catalogue ON products(active, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS products_artist ON products(artist_id, active);

CREATE TABLE IF NOT EXISTS bandcamp_items (
  product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('physical', 'digital')),
  state TEXT NOT NULL CHECK (state IN ('available', 'sold-out', 'preorder', 'listen')),
  price_mode TEXT NOT NULL CHECK (price_mode IN ('fixed', 'minimum', 'source')),
  thumbnail TEXT NOT NULL,
  release_id TEXT NOT NULL DEFAULT '',
  artist_url TEXT NOT NULL DEFAULT '',
  option_name TEXT NOT NULL DEFAULT '',
  options TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_slug TEXT NOT NULL REFERENCES categories(slug) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_slug)
);

CREATE INDEX IF NOT EXISTS product_categories_slug ON product_categories(category_slug, product_id);

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('customer', 'admin')),
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS limits (
  key TEXT NOT NULL,
  window INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  access_token TEXT NOT NULL UNIQUE,
  account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'shipped')),
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  country TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  stripe_session TEXT UNIQUE,
  email TEXT,
  shipping_details TEXT,
  paid_total_cents INTEGER,
  test INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS orders_account ON orders(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 20),
  unit_cents INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE TRIGGER IF NOT EXISTS reserve_inventory
AFTER INSERT ON order_items
BEGIN
  UPDATE products SET stock = stock - NEW.quantity, revision = revision + 1
  WHERE id = NEW.product_id AND active = 1 AND sample = 0
    AND stock >= NEW.quantity AND price_cents = NEW.unit_cents;
  SELECT CASE WHEN changes() = 0 THEN RAISE(ABORT, 'inventory_changed') END;
END;

CREATE TRIGGER IF NOT EXISTS release_inventory
AFTER UPDATE OF status ON orders
WHEN OLD.status = 'pending' AND NEW.status = 'expired'
BEGIN
  UPDATE products
  SET stock = stock + (SELECT quantity FROM order_items WHERE order_id = OLD.id AND product_id = products.id),
      revision = revision + 1
  WHERE id IN (SELECT product_id FROM order_items WHERE order_id = OLD.id);
END;
