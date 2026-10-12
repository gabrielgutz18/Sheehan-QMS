-- Delete moves a ticket to History instead of erasing it, and Restore puts it back in today's queue

ALTER TABLE orders ADD COLUMN deleted_at TEXT;        -- ISO 8601 while the ticket is deleted, otherwise NULL
ALTER TABLE orders ADD COLUMN restored_at TEXT;       -- ISO 8601, the last time it was restored
-- the day and number it was first given, kept when Restore moves it to a later day with a new number
ALTER TABLE orders ADD COLUMN original_date TEXT;
ALTER TABLE orders ADD COLUMN original_num INTEGER;

CREATE INDEX orders_deleted ON orders (deleted_at) WHERE deleted_at IS NOT NULL;
