-- first version of the database
-- never edit a migration once it has run anywhere; add the next numbered file instead (002_....sql)

-- orders taken at the kiosk; queue numbers start again at 1 every day
CREATE TABLE orders (
    id          INTEGER PRIMARY KEY,
    queue_date  TEXT    NOT NULL,                  -- YYYY-MM-DD, by the server's clock
    queue_num   INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    purpose     TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'serving', 'done')),
    remarks     TEXT    NOT NULL DEFAULT '',       -- shown under the number on the display when called
    created_at  TEXT    NOT NULL,                  -- ISO 8601
    called_at   INTEGER,                           -- ms since 1970, set each time the ticket is called
    UNIQUE (queue_date, queue_num)
);

CREATE INDEX orders_by_day_status ON orders (queue_date, status);

CREATE TABLE order_items (
    id        INTEGER PRIMARY KEY,
    order_id  INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    position  INTEGER NOT NULL,                    -- keeps the customer's order of lines
    item      TEXT    NOT NULL,
    qty       INTEGER NOT NULL CHECK (qty > 0),
    color     TEXT                                 -- roofing only: red, blue or green
);

CREATE INDEX order_items_by_order ON order_items (order_id);

-- last number handed out each day, so a deleted ticket's number is never given to someone else
CREATE TABLE queue_counters (
    queue_date  TEXT    PRIMARY KEY,
    last_num    INTEGER NOT NULL
);

-- app settings as JSON, e.g. the display video
CREATE TABLE settings (
    key    TEXT PRIMARY KEY,
    value  TEXT NOT NULL
);

-- staff sign-ins, so restarting the server doesn't sign everyone out
CREATE TABLE sessions (
    sid_hash  TEXT    PRIMARY KEY,                 -- SHA-256 of the cookie, never the cookie itself
    user      TEXT    NOT NULL,                    -- JSON
    expires   INTEGER NOT NULL                     -- ms since 1970
);
