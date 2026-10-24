-- Customer order's receiver, and the times the customer came in to sales and left it, typed in by sales staff
-- each is optional ('' when left blank, and on older tickets) and, like the runner, never printed on the ticket

ALTER TABLE orders ADD COLUMN receiver       TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN sales_time_in  TEXT NOT NULL DEFAULT '';   -- HH:MM (24-hour), e.g. 09:05, or ''
ALTER TABLE orders ADD COLUMN sales_time_out TEXT NOT NULL DEFAULT '';   -- HH:MM (24-hour), or ''
