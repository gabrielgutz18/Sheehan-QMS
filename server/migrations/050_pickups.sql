-- a pick-up: a customer who ordered on one day and comes back on a later day (orders.pickup_date) for the items. On
-- that day the ticket comes into the day's line for a sales counter by itself, under a number of its own that's never
-- shown (from 1001, so it takes none of the day's walk-in numbers), and everywhere it shows the number on the
-- customer's paper and the day it was given (original_num, original_date): "RS 01 · PICK-UP · Nov 11"
ALTER TABLE orders ADD COLUMN pickup_at TEXT;  -- ISO 8601, when it came into its pick-up day; NULL for every other ticket

-- finding the tickets due today, on every request
CREATE INDEX orders_by_pickup_date ON orders (pickup_date) WHERE pickup_date IS NOT NULL;
