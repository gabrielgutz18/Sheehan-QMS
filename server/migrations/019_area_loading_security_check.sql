-- Loading one area at a time, then the security check: a ticket for several types of order is loaded in each of
-- their areas in turn (Roofings, Steel, TBA; see src/data/loadingAreas.js), then every finished order waits at the
-- gate until a security guard verifies what the customer leaves with or reports something wrong, and only then is
-- it done on the Order status board

-- the area the loading crew called the customer to, while they're at loading; '' otherwise
ALTER TABLE orders ADD COLUMN loading_area TEXT NOT NULL DEFAULT '';

-- each area loading has finished for this visit, by whom and when; cleared when the order is reopened or restored
CREATE TABLE order_loads (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    area        TEXT    NOT NULL,                        -- Roofings, Steel or TBA
    loaded_by   INTEGER NOT NULL REFERENCES users (id),  -- the loading staff member who pressed Done there
    loaded_at   TEXT    NOT NULL,                        -- ISO 8601
    UNIQUE (order_id, area)
);

-- every security check, kept even if the order is reopened later: verified, or a report of something missing, more
-- than the order's quantity, or stolen, with what the guard saw
CREATE TABLE security_checks (
    id          INTEGER PRIMARY KEY,
    order_id    INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users (id),  -- the guard who checked it
    result      TEXT    NOT NULL CHECK (result IN ('verified', 'missing', 'over', 'stolen')),
    note        TEXT    NOT NULL DEFAULT '',
    checked_at  TEXT    NOT NULL                         -- ISO 8601
);

-- 1 while a finished order waits for the security check (orders done before this, and Customer Reports, never do);
-- security_check_id is this visit's check once there is one
ALTER TABLE orders ADD COLUMN security_pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN security_check_id INTEGER REFERENCES security_checks (id);
