-- Customer Report: a ticket for a concern instead of an order; it has no order_items, just the concern
-- in the customer's own words ('' on every order)

ALTER TABLE orders ADD COLUMN concern TEXT NOT NULL DEFAULT '';
