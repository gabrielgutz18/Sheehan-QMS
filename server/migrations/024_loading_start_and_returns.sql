-- Loading at a station, and sending an order back from the security check: the crew calls the customer to an area,
-- then presses Loading once the truck is there; from then on no other area can take the customer until that area
-- presses Done (or sends them back to waiting), so Steel waits while Roofings is loading
-- a guard who finds something wrong at the gate can send the order back to one of its areas: only that area loads it
-- again, the others stay loaded, and then it comes back to the security check

-- when the crew pressed Loading at the area the customer was called to (ISO 8601); NULL while they're only called
ALTER TABLE orders ADD COLUMN loading_started_at TEXT;

-- the area a report sent the order back to; '' for a check that finished the order
ALTER TABLE security_checks ADD COLUMN returned_to TEXT NOT NULL DEFAULT '';

-- the check that last sent this order back, so the area sees why it's loading again; cleared by the next check, a
-- reopen or a restore
ALTER TABLE orders ADD COLUMN return_check_id INTEGER REFERENCES security_checks (id);
