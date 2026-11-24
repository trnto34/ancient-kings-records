ALTER TABLE products ADD COLUMN parent_id INTEGER REFERENCES products(id);
ALTER TABLE products ADD COLUMN variant_label TEXT NOT NULL DEFAULT '';
ALTER TABLE bandcamp_items ADD COLUMN stock_imported INTEGER NOT NULL DEFAULT 0 CHECK (stock_imported IN (0, 1));

CREATE INDEX IF NOT EXISTS products_parent ON products(parent_id);

DROP TRIGGER IF EXISTS reject_bandcamp_order_item;

CREATE TRIGGER IF NOT EXISTS verify_order_listing
BEFORE INSERT ON order_items
WHEN EXISTS (
  SELECT 1 FROM products p
  LEFT JOIN products parent ON parent.id = p.parent_id
  LEFT JOIN bandcamp_items b ON b.product_id = p.id
  WHERE p.id = NEW.product_id AND (
    p.format = 'Shipping add-on' OR b.kind = 'digital'
    OR EXISTS (SELECT 1 FROM products variant WHERE variant.parent_id = p.id)
    OR (p.parent_id IS NOT NULL AND (parent.active <> 1 OR parent.sample <> 0))
  )
)
BEGIN
  SELECT RAISE(ABORT, 'inventory_changed');
END;

PRAGMA user_version = 2;
