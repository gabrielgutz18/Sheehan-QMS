-- a TBA priority order: sales staff mark it on Customer order, as a priority order, and its ticket shows with "**" in
-- front, "** T 01"; an order is a priority order or a TBA priority one, never both (server/api.js checks it)
ALTER TABLE orders ADD COLUMN tba_priority INTEGER NOT NULL DEFAULT 0;   -- 1 for a TBA priority order, 0 otherwise
