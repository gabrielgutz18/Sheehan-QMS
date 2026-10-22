-- Handing over to loading: every customer is served at a sales counter first; for an order that goes to the loading
-- crews, the sales staff member then presses Hand over to loading, and only from then can the crews call them from
-- the Loading page (it counts as the sales staff member's customer served)

ALTER TABLE orders ADD COLUMN handed_over_by INTEGER REFERENCES users(id);   -- who handed them over; NULL while still with sales
ALTER TABLE orders ADD COLUMN handed_over_at TEXT;                          -- when (ISO 8601), or NULL
