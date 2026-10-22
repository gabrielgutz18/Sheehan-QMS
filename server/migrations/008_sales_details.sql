-- Customer order as sales staff fill it in: the invoice that lists the items, who sold it, how it's paid, the
-- loading crew it goes to, and for a returning customer, the day they come back for the items
-- a ticket can be for several types of order at once; they're kept together in purpose ("Roofings, Steel")
-- payment_status and team aren't CHECKed: their lists are in src/data, so adding one needs no new migration

ALTER TABLE orders ADD COLUMN invoice_no     TEXT NOT NULL DEFAULT '';   -- e.g. 2223; '' on older tickets
ALTER TABLE orders ADD COLUMN salesman       TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT '';   -- Vale, Paid, Terms (src/data/paymentStatus.js)
ALTER TABLE orders ADD COLUMN team           TEXT NOT NULL DEFAULT '';   -- the loading crew (src/data/teams.js)
ALTER TABLE orders ADD COLUMN pickup_date    TEXT;                       -- YYYY-MM-DD a returning customer collects, or NULL
