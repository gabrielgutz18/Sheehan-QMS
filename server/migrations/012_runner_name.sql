-- Customer order's runner: the person a customer sends to collect the items for them, so the loading crews know who
-- to hand them to; '' when the customer collects the items themselves (and on older tickets)

ALTER TABLE orders ADD COLUMN runner TEXT NOT NULL DEFAULT '';
