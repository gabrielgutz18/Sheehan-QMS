-- Loaded by: loading is a step of the order, not serving the customer, so Done at loading means the crew has finished
-- loading it (the truck, for roofing); the order stays served by the sales staff member who handed it over, and the
-- loading staff member who pressed Done is kept beside it

ALTER TABLE orders ADD COLUMN loaded_by INTEGER REFERENCES users(id);   -- who finished loading it; NULL until then
ALTER TABLE orders ADD COLUMN loaded_at TEXT;                           -- when they pressed Done (ISO 8601), or NULL

-- an order loading has already finished was left served by the loading staff member: they loaded it, and it goes back
-- to the sales staff member who handed it over (when isn't known, so loaded_at stays NULL)
UPDATE orders SET loaded_by = served_by, served_by = handed_over_by
WHERE status = 'done' AND handed_over_by IS NOT NULL;
