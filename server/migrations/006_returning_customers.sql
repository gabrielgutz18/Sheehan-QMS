-- Returning customer: a status for someone who has come back after being served; they wait in line again with
-- their own number until a counter calls them

-- SQLite can't change a CHECK, so orders is rebuilt with the new list and its rows copied across; foreign keys are
-- off while migrations run (see server/db.js), so dropping the old table leaves order_items and serves alone

CREATE TABLE orders_new (
    id             INTEGER PRIMARY KEY,
    queue_date     TEXT    NOT NULL,                  -- YYYY-MM-DD, by the server's clock
    queue_num      INTEGER NOT NULL,
    name           TEXT    NOT NULL,
    purpose        TEXT    NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'serving', 'returning', 'done')),
    remarks        TEXT    NOT NULL DEFAULT '',       -- shown under the number on the display when called
    created_at     TEXT    NOT NULL,                  -- ISO 8601
    called_at      INTEGER,                           -- ms since 1970, set each time the ticket is called
    deleted_at     TEXT,                              -- ISO 8601 while the ticket is deleted, otherwise NULL
    restored_at    TEXT,                              -- ISO 8601, the last time it was restored
    original_date  TEXT,                              -- the day and number it was first given, kept on a restore
    original_num   INTEGER,
    served_by      INTEGER REFERENCES users (id),     -- the staff member who called the ticket
    concern        TEXT    NOT NULL DEFAULT '',       -- a Customer Report's concern, '' on every order
    UNIQUE (queue_date, queue_num)
);

INSERT INTO orders_new (id, queue_date, queue_num, name, purpose, status, remarks, created_at, called_at,
                        deleted_at, restored_at, original_date, original_num, served_by, concern)
SELECT id, queue_date, queue_num, name, purpose, status, remarks, created_at, called_at,
       deleted_at, restored_at, original_date, original_num, served_by, concern
FROM orders;

DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX orders_by_day_status ON orders (queue_date, status);
CREATE INDEX orders_deleted ON orders (deleted_at) WHERE deleted_at IS NOT NULL;
